/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2022 Joyent, Inc.
 * Copyright 2022 MNX Cloud, Inc.
 */

/*
 * This plugin calls to an external service to verify that the requested
 * provision is allowed. Generally, this is used to ensure the user has a
 * valid form of payment on file with a payment processor.
 *
 * To configure this plugin, the following config parameters are required:
 *
 * - url: URL of external server that will respond with 200 for success or
 *   402 for failure.
 * - code: A short error code
 * - message: Longer, more informative error message
 * - allow_list: (Optional) A list of accounts that are always allowed.
 *
 * You can also have an optional list
 *
 * {
 *    "name": "/data/plugins/preprovision",
 *    "enabled": true,
 *    "config": {
 *        "url": "https://approval.example.com",
 *        "code": "Payment Method Required",
 *        "message": "To be able to provision you must update your payment method.",
 *        "allow_list": [
 *            "<account UUID 1>",
 *            "<account UUID 2>",
 *            ...
 *        ]
 *    }
 * }
 */

// ensure modules load regardless of repo
module.paths.push('/opt/smartdc/cloudapi/node_modules',
    '/opt/smartdc/docker/node_modules');

var mod_assert = require('assert');
var mod_util = require('util');
var mod_restify = require('restify');
var mod_bunyan = require('bunyan');

var SECONDS = 1000;

function assertType(val, typ, nam) {
    var msg = mod_util.format('%s (%s) required', nam, typ);

    mod_assert.strictEqual(typeof (val), typ, msg);
}

function TritonPreprovisionPlugin(api, config) {
    assertType(api, 'object', 'api');
    assertType(config, 'object', 'config');
    assertType(config.url, 'string', 'config.url');
    assertType(config.allow_list, 'object', 'config.allow_list');

    if (typeof (config.maxDelay) === 'number' && !isNaN(config.maxDelay) &&
        config.maxDelay > 0 && config.maxDelay < 30 * SECONDS) {

        this.triton_pp_maxDelay = config.maxDelay;
    } else {
        this.triton_pp_maxDelay = 10 * SECONDS;
    }

    this.log = api.log;
    this.triton_pp_url = config.url;
    this.triton_pp_client = mod_restify.createJsonClient({
        url: this.triton_pp_url,
        userAgent: 'TritonPreprovisionPlugin/1.0',

        /*
         * In order to avoid causing provisioning delays (or worse, spurious
         * failures) we clamp the connection and request timeouts to a small
         * value, and disable all retry behaviour.
         */
        connectTimeout: this.triton_pp_maxDelay,
        requestTimeout: this.triton_pp_maxDelay,
        retry: false,
        agent: false
    });

    /*
     * Keep an in-memory record of our recent activity for debugging
     * purposes:
     */
    this.triton_pp_ringbuffer = new mod_bunyan.RingBuffer({
        limit: 128
    });
}

TritonPreprovisionPlugin.prototype.check = function check(opts, next) {
    var self = this;
    var log = self.log.child({
        tritonPlugin: {
            uuid: opts.account.uuid,
            login: opts.account.login
        },
        streams: [
            {
                level: mod_bunyan.TRACE,
                type: 'raw',
                stream: self.triton_pp_ringbuffer
            }
        ]
    });

    log.debug('external approval start');

    /*
     * Consult the account whitelist to see if this account is one for which
     * we do not require approval checks.
     */
    if (WHITELIST[opts.account.uuid]) {
        if (WHITELIST[opts.account.uuid] === opts.account.login) {
            log.info('account in whitelist; skipping checks');
            setImmediate(next);
            return;
        }

        log.warn({
            whitelistName: WHITELIST[opts.account.uuid]
        }, 'account in whitelist, but login name did not match');
    }

    /*
     * Regardless of what happens during the request to the backend server, we
     * want a hard upper bound on the length of time the approval check can
     * take.  If there is a network partition, or the backend service is
     * available but extremely slow, we should fail open.
     */
    var abortFired = false;
    var abortTimeout = setTimeout(function fireAbortTimeout() {
        abortFired = true;
        log.error({
            maxDelay: self.triton_pp_maxDelay
        }, 'external approval aborted due to timeout (ignoring)');
        next();
    }, self.triton_pp_maxDelay);

    /*
     * Call the approval server.  If we hit a failure condition that is not
     * understood, allow the system to fail open.  It is of paramount
     * importance that customers are able to provision, even when some of our
     * non-critical backend services are unavailable.
     */
    self.triton_pp_client.get({
        path: mod_util.format('/approval/%s', opts.account.uuid)
    }, function checkGet(err, creq, cres, obj) {
        log.trace({
            req: creq,
            res: cres,
            resObj: obj,
            err: err,
            abortFired: abortFired
        }, 'external approval response');

        if (abortFired) {
            /*
             * The handler has already finished.  Do nothing.
             */
            log.error({
                err: err,
                req: creq,
                res: cres,
                obj: obj
            }, 'external approval check completed after timeout');
            return;
        }
        clearTimeout(abortTimeout);

        if (cres && cres.statusCode === 402 || cres.statusCode === 403 ) {
            log.info({
                res: cres
            }, 'approval check denied');
            next(new mod_restify.NotAuthorizedError(mod_util.format('%s: %s',
                CODE, MESSAGE)));
            return;
        }

        /*
         * Attempt to report failures that we do not expect, but are
         * nonetheless ignoring:
         */
        if (err) {
            log.warn({
                err: err
            }, 'external approval check failed (ignoring)');
        } else if (!cres.statusCode || cres.statusCode < 200 ||
            cres.statusCode > 299) {

            log.warn({
                res: cres
            }, 'external approval unexpected response (ignoring)');
        } else {
            log.info({
                statusCode: cres.statusCode,
                obj: obj
            }, 'external approval check granted');
        }

        next();
    });
};

module.exports = {
    allowProvision: function createAllowProvision(api, config) {
        var triton_pp = new TritonPreprovisionPlugin(api, config);

        return (triton_pp.check.bind(triton_pp));
    }
};

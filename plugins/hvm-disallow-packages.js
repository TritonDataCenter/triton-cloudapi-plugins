/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 * Triton HVM disallowed packages pre-provision plugin.
 *
 * This plugin will just check if the machine being created is a KVM/bhyve
 * machine, and if that's the case, verify that the package being used to
 * create such a machine isn't one of the disallowed packages specified with
 * prefixes in the plugin's config.
 *
 * For example, the following fragment added at the end of the CLOUDAPI_PLUGINS
 * metadata value will disallow provisioning KVM/bhyve machines with any package
 * with a name starting with "t4-":
 *
 *      {
 *          "name": "hvm-disallowed-packages",
 *          "enabled": true,
 *          "config": {
 *              "package_prefixes": ["t4-"]
 *          }
 *      }
 *
 * This adds a new CreateMachine error code: "InvalidPackage".
 */

// ensure modules load regardless of repo
module.paths.push('/opt/smartdc/cloudapi/node_modules',
    '/opt/smartdc/docker/node_modules');

var assert = require('assert');
var format = require('util').format;
var restify = require('restify');

var CODE = 'InvalidPackage';
var PLUG_NAME = 'hvm-disallowed-packages';
var ROUTE_NAME = 'createmachine';
var InvalidArgumentError = restify.InvalidArgumentError;


function allowProvision(api, cfg) {
    assert.ok(api && typeof (api) === 'object', 'api (object) is required');
    assert.ok(cfg && typeof (cfg) === 'object', 'cfg (object) is required');

    var prefixes = cfg.package_prefixes;
    assert.ok(Array.isArray(prefixes), 'package_prefixes must be an array');

    var log = api.log;

    return function HvmDisallowedPackages(opts, next) {
        var dataset = opts.image;
        var pkg = opts.pkg;

        if (!prefixes.length) {
            log.debug(PLUG_NAME + ': no package prefixes; allowing.');
            return next();
        }

        if (!dataset) {
            log.debug(PLUG_NAME + ': no dataset on req; skipping checks.');
            return next();
        }

        if (dataset.type !== 'zvol') {
            log.debug(PLUG_NAME + ': not KVM/bhyve; skipping checks.');
            return next();
        }

        if (!pkg) {
            log.debug(PLUG_NAME + ': no package on req; skipping checks.');
            return next();
        }

        for (var i = 0; i !== prefixes.length; i++) {
            var pfx = prefixes[i];

            log.debug(PLUG_NAME + ': checking prefix "' + pfx + '"');

            if (pkg.name.indexOf(pfx) === 0) {
                var err = new InvalidArgumentError(format(
                    'HVM instances may not use "%s*" packages: %s',
                    pfx, pkg.name));
                err.body.code = err.restCode = CODE;
                return next(err);
            }
        }

        return next();
    };
}


module.exports = {
    allowProvision: allowProvision
};

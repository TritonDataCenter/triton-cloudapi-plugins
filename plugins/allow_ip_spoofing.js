/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Brian Bennett.
 * Copyright (c) 2018, Marsell Kukuljevic.
 */

/*
 * Enables allow_ip_spoofing for all created instances on
 * specified users on specified networks.
 *
 * The purpose of this plugin is to allow slaac/addrconf IPv6
 * interface configuration until Triton supports IPv6 networks
 * proper. Obviously, this is a security risk and should only be
 * used in strictly trusted circumstances.
 *
 * To configure this plugin, add the UUIDs of the accounts and associated
 * networks that should have IP spoofing enabled.
 *
 * {
 *    "name": "allow_ip_spoofing",
 *    "enabled": true,
 *    "config": {
 *        "user_networks": {
 *            "<account UUID 1>": ["<network UUID 1>", "<network UUID 2>"],
 *            "<account UUID 2>": [...],
 *            ...
 *        }
 *    }
 * }
 *
 * This is added to CLOUDAPI_PLUGINS and DOCKER_PLUGINS, serialized to JSON, and
 * PUT to cloudapi's and sdc-docker's sapi services. E.g.:
 *
 * sdc-sapi /services/$(sdc-sapi /services?name=cloudapi | json -Ha uuid) -X PUT
 * -d '{
 *    "metadata": {
 *         "CLOUDAPI_PLUGINS": "[{\"name\":\"allow_ip_spoofing\", \
 *         \"enabled\": true, \"config\": {\"user_networks\": \
 *         {\"fb7f31ad-52d6-4e92-83d2-9f9d94ceef3f\": \
 *         [\"3f9fc37a-43c4-11e8-88b5-42004d19d401\"]}}}]"
 *    }
 * }'
 */

// ensure modules load regardless of repo
module.paths.push('/opt/smartdc/cloudapi/node_modules',
    '/opt/smartdc/docker/node_modules');

var assert = require('assert-plus');


function modifyIpSpoofing(api, cfg) {
    assert.object(api, 'api');
    assert.object(api.log, 'api.log');
    assert.object(cfg, 'cfg');
    assert.object(cfg.user_networks, 'cfg.user_networks');

    var log = api.log;
    var userNetworks = cfg.user_networks;

    return function addIpSpoofing(opts, cb) {
        assert.object(opts, 'opts');
        assert.object(opts.account, 'opts.account');
        assert.object(opts.networks, 'opts.networks');
        assert.uuid(opts.req_id, 'opts.req_id');
        assert.func(cb, 'cb');

        log.debug('Running', addIpSpoofing.name);

        var accountUuid = opts.account.uuid;
        var networkUuids = userNetworks[accountUuid];

        log.trace({user: accountUuid, networks: networkUuids},
            'Permitted networks for user');

        if (Array.isArray(networkUuids) && networkUuids.length > 0) {
            log.debug('Checking account', accountUuid,
                'for IP spoofing networks');

            opts.networks.forEach(function addSpoofToNetwork(network) {
                var ipv4Uuid = network.ipv4_uuid || network.uuid;
                log.trace('Provision netowrk:', ipv4Uuid);

                if (ipv4Uuid && networkUuids.indexOf(ipv4Uuid) !== -1) {
                    log.info('Network', ipv4Uuid, 'set spoofable for account',
                        accountUuid);
                    network.allow_ip_spoofing = true;
                }
            });
        }

        return cb();
    };
}


module.exports = {
    modifyProvisionNetworks: modifyIpSpoofing
};

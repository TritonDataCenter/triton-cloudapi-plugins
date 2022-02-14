# triton-cloudapi-plugins

This repo holds various CloudAPI/sdc-docker plugins. Some of them have been
developed contributed from the community.

Despite the repo name being "cloudapi", these plugins work for `sdc-docker` as
well, if configured. These plugins *do not* work with provisions done via
AdminUI or directly against VMAPI. To wit, these plgins modify the JSON payload
before being sent to VMAPI.

## Overview

A plugin is a node.js module communicating through cloudapi's/sdc-docker's
plugin-manager, in which you can attach various hooks for CreateMachine and
other endpoints, including pre- and post-provision. See the "Plugins" section of
the cloudapi admin document for specifics:
<https://github.com/joyent/sdc-cloudapi/blob/master/docs/admin.md#plugins>

## Deployment

Currently deployment is:

* Check if cloudapi's delegate dataset is mounted at "/data" via

        sdc-login cloudapi
        zfs list

  If it is not mounted, then do so (inside the cloudapi zone):

        zfs set mountpoint=/data zones/$(zonename)/data

  sdc-docker should have a delegated dataset mounted at "/data".

* Copy the latest `plugins/*.js` files from this repo to
  "/data/plugins" in the cloudapi/docker zone(s) in each DC.

* Copy the latest `bin/vicloudapiplugins` command to your headnode (preferably
  to `/opt/custom/bin`)

* Use the `vicloudapiplugins` command to add or update the plugin configs as
  necessary. The current cloudapi plugin config is:

        sdc-login cloudapi
        json -f /opt/smartdc/cloudapi/etc/cloudapi.cfg plugins

  And for sdc-docker:

        sdc-login docker
        json -f /opt/smartdc/docker/etc/config.json plugins

  Each plugin you want enabled should have an object something like this:

        {
            "name": "/data/plugins/example-plugin"
            "enabled": true,
            "config": {
                /* arbitrary object passed to your plugin */
            }
        },

  **Note:** The plugin name is the filename without the `.js` extension.

  The "plugins" config is set via `metadata.CLOUDAPI_PLUGINS` on the SAPI
  "cloudapi" service, and `metadata.DOCKER_PLUGINS` for the "sdc-docker"
  service.  However, be warned that it is **JSON encoded as a string** because
  of how the config-agent templating is limited. This can make editing that
  plugins block by hand a challenge. Use of the `vicloudapiplugins` command is
  recomended.

  Here is technique for manually editing the config
  (run these in the headnode global zone):

        cd /var/tmp
        cloudapi_svc=$(sdc-sapi /services?name=cloudapi | json -H 0.uuid)
        [[ -n $cloudapi_svc ]] || echo "error: no cloudapi service?"

        docker_svc=$(sdc-sapi /services?name=cloudapi | json -H 0.uuid)
        [[ -n $cloudapi_svc ]] || echo "error: no cloudapi service?"

        # Get the current plugins and edit:
        sapiadm get $cloudapi_svc \
            | json -e 'this.update = { plugins: JSON.parse(metadata.CLOUDAPI_PLUGINS) };' update \
            > plugins-update.json
        vi plugins-update.json   # See "Plugin Config Syntax" below

        # Validate your edited JSON:
        json -f plugins-update.json 1>/dev/null

        # Add your change to the cloudapi and sdc-docker SAPI service:
        json -f plugins-update.json -e 'this.metadata = { CLOUDAPI_PLUGINS: JSON.stringify(this.plugins) }; this.plugins = undefined;' \
            | sapiadm update $cloudapi_svc
        json -f plugins-update.json -e 'this.metadata = { DOCKER_PLUGINS: JSON.stringify(this.plugins) }; this.plugins = undefined;' \
            | sapiadm update $docker_svc

* Restart all the cloudapi and docker services. If you made a config change,
  config-agent should restart the services after a minute, but you can force an
  immediate update:

        # Update config and restart cloudapi.
        sdc-login -l cloudapi
        svcadm restart config-agent

        # Update config and restart sdc-docker.
        sdc-login -l docker
        svcadm restart config-agent

  If there was no config change (e.g. just a code change):

        # Restart cloudapi
        svcadm restart svc:/smartdc/application/cloudapi:cloudapi-*

        # Restart docker
        svcadm restart svc:/smartdc/application/docker

We hope to improve that process.

## Plugin Config Syntax

Plugin config goes into the `CLOUDAPI_PLUGINS` `DOCKER_PLUGINS` metadata object
of the respective service in SAPI. Each plugin has documented in the comments
what a correct config object looks like for that plugin. See individual plugins
for the expected JSON object format.

## Development

    git clone https://github.com/joyent/triton-cloudapi-plugins.git
    cd triton-cloudapi-plugins
    make
    make check

Please run 'make check' prior to commiting.

A quick way to get an in-dev plugin into the right place in your COAL is
(assuming a "Host coal" in your "~/.ssh/config):

    ./tools/rsync-to coal

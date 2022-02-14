
NAME		:= triton-cloudapi-plugins

JS_FILES	:= $(shell ls plugins/*.js)
JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_FILES_NODE	 = $(JS_FILES)
JSSTYLE_FILES	 = $(JS_FILES)
JSSTYLE_FLAGS	 = -f tools/jsstyle.conf
CLEAN_FILES += ./node_modules
DISTCLEAN_FILES += $(NAME)-*.tgz

include ./tools/mk/Makefile.defs

RELEASE_TARBALL	:= $(NAME)-$(STAMP).tgz
RELSTAGEDIR       := /tmp/$(STAMP)


#
# Targets
#
.PHONY: all
all: | $(REPO_DEPS)

.PHONY: release
release: all
	echo "Building $(RELEASE_TARBALL)"
	mkdir -p $(RELSTAGEDIR)/
	echo $(STAMP) >$(RELSTAGEDIR)/buildstamp
	cp -r \
		$(TOP)/plugins \
		$(TOP)/package.json \
		$(RELSTAGEDIR)/
	(cd $(RELSTAGEDIR) && $(TAR) -czf $(TOP)/$(RELEASE_TARBALL) ./)
	@rm -rf $(RELSTAGEDIR)

.PHONY: publish
publish: release
	@echo "TODO: publish to release dir in manta

include ./tools/mk/Makefile.deps
include ./tools/mk/Makefile.targ


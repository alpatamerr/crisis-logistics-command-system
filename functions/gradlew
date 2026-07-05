#!/usr/bin/env bash

# DO NOT MODIFY OR DELETE THIS FILE.
#
# ANY CHANGES MAY RESULT IN SERIOUS DAMAGE
# TO THE TECHNICAL INFRASTRUCTURE AND LOSS OF DATA!

#
# Copyright © 2015-2021 the original authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

#########################
## Foundry-specific setup
#########################

set -euo pipefail
IFS=$'\n\t'

if [ -z "${JAVA_HOME:-}" ]; then
   echo "JAVA_HOME not set, please ensure JAVA_HOME is set as an environment variable.";
   exit 1
elif [ ! -d "${JAVA_HOME}" ]; then
   echo "JAVA_HOME is set to '${JAVA_HOME}', but this is not a valid directory. Please set JAVA_HOME to the root of your JDK installation.";
   exit 1
fi

root_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
gradle_dist="gradle-7.6.4-bin.zip"

if [ -z "${JEMMA:-}" ]; then
    if [ "${FOUNDRY_CONTAINER_RUNTIME_TYPE:-}" = "CODE_WORKSPACE" ]; then
      echo "Detected environment is a Code Workspace"

      BEARER_TOKEN=$(cat $FOUNDRY_SCOPED_TOKEN)
      SERVICE_DISCOVERY=$(cat $FOUNDRY_SERVICE_DISCOVERY_V2)

      uri() {
        echo $(yq -r ".$1[0]" <<< "$SERVICE_DISCOVERY")
      }

      export GRADLE_OPTS="${GRADLE_OPTS:-} -Dgradle.wrapperUser='user' -Dgradle.wrapperPassword=$BEARER_TOKEN"
      export ORG_GRADLE_PROJECT_externalUri=$FOUNDRY_EXTERNAL_HOST
      export ORG_GRADLE_PROJECT_bearerToken=$BEARER_TOKEN
      export ORG_GRADLE_PROJECT_isRunningLocally=FALSE
      export ORG_GRADLE_PROJECT_repoRid=`git remote get-url origin | sed 's|.*/stemma/git/\([^/]*\).*|\1|'`
      export ORG_GRADLE_PROJECT_functionExecutorApiUri=$(uri function_executor)
      export ORG_GRADLE_PROJECT_functionRegistryApiUri=$(uri function_registry)
      export ORG_GRADLE_PROJECT_ontologyMetadataApiUri=$(uri ontology_metadata)
      export ORG_GRADLE_PROJECT_compassApiUri=$(uri compass)
      export ORG_GRADLE_PROJECT_actionsApiUri=$(uri actions)
      export ORG_GRADLE_PROJECT_artifactsApiUri=$(uri artifacts)
      export ORG_GRADLE_PROJECT_opusServerApiUri=$(uri opus_server)
      export ORG_GRADLE_PROJECT_bellasoApiUri=$(uri bellaso)
      export ORG_GRADLE_PROJECT_foundryMlApiUri=$(uri foundry_ml)
      export ORG_GRADLE_PROJECT_foundryMlLiveApiUri=$(uri foundry_ml_live)
      export ORG_GRADLE_PROJECT_modelsApiUri=$(uri models_service)
      export ORG_GRADLE_PROJECT_webhooksApiUri=$(uri webhooks)
      export ORG_GRADLE_PROJECT_multipassApiUri=$(uri multipass)
      export ORG_GRADLE_PROJECT_jemmaApiUri=$(uri jemma)
      export ORG_GRADLE_PROJECT_magritteCoordinatorApiUri=$(uri magritte_coordinator)
      export ORG_GRADLE_PROJECT_languageModelServiceApiUri=$(uri language_model_service)
      export ORG_GRADLE_PROJECT_apiGateway=$(uri api_gateway)
      export ORG_GRADLE_PROJECT_corditeApiUri=$(uri cordite)
      export ORG_GRADLE_PROJECT_foundryTelemetryServiceApiUri=$(uri foundry_telemetry_service)

      gradleDistributionUrl="$(uri asset_server)/dyn/gradle-distributions/$gradle_dist"
    else
      if [ -n "${FOUNDRY_HOSTNAME:-}" ] && [ -n "${FOUNDRY_TOKEN:-}" ] && [ -n "${FOUNDRY_USERNAME:-}" ]; then
          # Use the available environment variables if already present
          echo "Environment variables [FOUNDRY_HOSTNAME, FOUNDRY_USERNAME, FOUNDRY_TOKEN] are already set. Using them"
          export GIT_REMOTE_HOST="${FOUNDRY_HOSTNAME}"
          export GIT_REMOTE_USERNAME="${FOUNDRY_USERNAME}"
          export GIT_REMOTE_PASSWORD="${FOUNDRY_TOKEN}"
      else
          git_remote="$(git config remote.origin.url)" && ret=$? || ret=$?
          if [ $ret -ne 0 ]; then
              echo "Warning: Git remote url not set."
              echo "Please ensure the following environment variables are set [FOUNDRY_HOSTNAME, FOUNDRY_USERNAME, FOUNDRY_TOKEN]"
              exit 1
          else # git remote configured, infer variables from it
              # Extract the external hostname and bearer token from the git remote
              # Assuming that Authoring generates a git remote of the
              # form https://<user>:<token>@<hostname>:<port>/<path-to-repo>
              strip_before_host="${git_remote#*@}"
              git_host_and_port="${strip_before_host%%/*}"

              strip_after_userinfo="${git_remote%%@*}"
              git_userinfo="${strip_after_userinfo#*//}"
              git_username="${git_userinfo%%:*}"
              git_password="${git_userinfo#*:}"

              export GIT_REMOTE_HOST="${git_host_and_port}"
              export GIT_REMOTE_USERNAME="${git_username}"
              export GIT_REMOTE_PASSWORD="${git_password}"
          fi
      fi

      export GRADLE_OPTS="${GRADLE_OPTS:-} -Dgradle.wrapperUser='$GIT_REMOTE_USERNAME' -Dgradle.wrapperPassword=$GIT_REMOTE_PASSWORD"
      export ORG_GRADLE_PROJECT_externalUri="https://$GIT_REMOTE_HOST"
      export ORG_GRADLE_PROJECT_bearerToken="$GIT_REMOTE_PASSWORD"
      export ORG_GRADLE_PROJECT_isRunningLocally=TRUE
      export ORG_GRADLE_PROJECT_repoRid=`git remote get-url origin | sed 's|.*/stemma/git/\([^/]*\).*|\1|'`
      export ORG_GRADLE_PROJECT_functionExecutorApiUri=$ORG_GRADLE_PROJECT_externalUri/function-executor/api
      export ORG_GRADLE_PROJECT_functionRegistryApiUri=$ORG_GRADLE_PROJECT_externalUri/function-registry/api
      export ORG_GRADLE_PROJECT_ontologyMetadataApiUri=$ORG_GRADLE_PROJECT_externalUri/ontology-metadata/api
      export ORG_GRADLE_PROJECT_compassApiUri=$ORG_GRADLE_PROJECT_externalUri/compass/api
      export ORG_GRADLE_PROJECT_actionsApiUri=$ORG_GRADLE_PROJECT_externalUri/actions/api
      export ORG_GRADLE_PROJECT_artifactsApiUri=$ORG_GRADLE_PROJECT_externalUri/artifacts/api
      export ORG_GRADLE_PROJECT_opusServerApiUri=$ORG_GRADLE_PROJECT_externalUri/opus-server/api
      export ORG_GRADLE_PROJECT_bellasoApiUri=$ORG_GRADLE_PROJECT_externalUri/bellaso/api
      export ORG_GRADLE_PROJECT_foundryMlApiUri=$ORG_GRADLE_PROJECT_externalUri/foundry-ml/api
      export ORG_GRADLE_PROJECT_foundryMlLiveApiUri=$ORG_GRADLE_PROJECT_externalUri/foundry-ml-live/api
      export ORG_GRADLE_PROJECT_modelsApiUri=$ORG_GRADLE_PROJECT_externalUri/models/api
      export ORG_GRADLE_PROJECT_webhooksApiUri=$ORG_GRADLE_PROJECT_externalUri/webhooks/api
      export ORG_GRADLE_PROJECT_multipassApiUri=$ORG_GRADLE_PROJECT_externalUri/multipass/api
      export ORG_GRADLE_PROJECT_jemmaApiUri=$ORG_GRADLE_PROJECT_externalUri/jemma/api
      export ORG_GRADLE_PROJECT_magritteCoordinatorApiUri=$ORG_GRADLE_PROJECT_externalUri/magritte-coordinator/api
      export ORG_GRADLE_PROJECT_languageModelServiceApiUri=$ORG_GRADLE_PROJECT_externalUri/language-model-service/api
      export ORG_GRADLE_PROJECT_apiGateway=$ORG_GRADLE_PROJECT_externalUri/api
      export ORG_GRADLE_PROJECT_corditeApiUri=$ORG_GRADLE_PROJECT_externalUri/cordite/api
      export ORG_GRADLE_PROJECT_foundryTelemetryServiceApiUri=$ORG_GRADLE_PROJECT_externalUri/foundry-telemetry-service/api

      gradleDistributionUrl="$ORG_GRADLE_PROJECT_externalUri/assets/dyn/gradle-distributions/$gradle_dist"
    fi

    if [ -f /etc/ssl/rubix-ca/truststore.jks ]; then
      export ORG_GRADLE_PROJECT_trustStore=/etc/ssl/rubix-ca/truststore.jks
    elif [ -f $JAVA_HOME/jre/lib/security/cacerts ]; then
      export ORG_GRADLE_PROJECT_trustStore=${ORG_GRADLE_PROJECT_trustStore:-$JAVA_HOME/jre/lib/security/cacerts}
    elif [ -f $JAVA_HOME/lib/security/cacerts ]; then
      export ORG_GRADLE_PROJECT_trustStore=${ORG_GRADLE_PROJECT_trustStore:-$JAVA_HOME/lib/security/cacerts}
    fi

    export JAVA_OPTS="-Djavax.net.ssl.trustStore=$ORG_GRADLE_PROJECT_trustStore"
fi

if [[ "${STATIC_GRADLE_BINARY_URI:-}" ]] && [[ "$STATIC_GRADLE_BINARY_URI" == *"$gradle_dist"* ]]; then
  gradleDistributionUrl="$STATIC_GRADLE_BINARY_URI"
fi

sed -e "s|\${gradleDistributionUrl}|${gradleDistributionUrl}|g" "${root_dir}/gradle/wrapper/gradle-wrapper.template.properties" > "${root_dir}/gradle/wrapper/gradle-wrapper.properties"

set +euo pipefail
#############################
## End Foundry-specific setup
## Begin core gradlew script
#############################

##############################################################################
#
#   Gradle start up script for POSIX generated by Gradle.
#
#   Important for running:
#
#   (1) You need a POSIX-compliant shell to run this script. If your /bin/sh is
#       noncompliant, but you have some other compliant shell such as ksh or
#       bash, then to run this script, type that shell name before the whole
#       command line, like:
#
#           ksh Gradle
#
#       Busybox and similar reduced shells will NOT work, because this script
#       requires all of these POSIX shell features:
#         * functions;
#         * expansions «$var», «${var}», «${var:-default}», «${var+SET}»,
#           «${var#prefix}», «${var%suffix}», and «$( cmd )»;
#         * compound commands having a testable exit status, especially «case»;
#         * various built-in commands including «command», «set», and «ulimit».
#
#   Important for patching:
#
#   (2) This script targets any POSIX shell, so it avoids extensions provided
#       by Bash, Ksh, etc; in particular arrays are avoided.
#
#       The "traditional" practice of packing multiple parameters into a
#       space-separated string is a well documented source of bugs and security
#       problems, so this is (mostly) avoided, by progressively accumulating
#       options in "$@", and eventually passing that to Java.
#
#       Where the inherited environment variables (DEFAULT_JVM_OPTS, JAVA_OPTS,
#       and GRADLE_OPTS) rely on word-splitting, this is performed explicitly;
#       see the in-line comments for details.
#
#       There are tweaks for specific operating systems such as AIX, CygWin,
#       Darwin, MinGW, and NonStop.
#
#   (3) This script is generated from the Groovy template
#       https://github.com/gradle/gradle/blob/HEAD/subprojects/plugins/src/main/resources/org/gradle/api/internal/plugins/unixStartScript.txt
#       within the Gradle project.
#
#       You can find Gradle at https://github.com/gradle/gradle/.
#
##############################################################################

# Attempt to set APP_HOME

# Resolve links: $0 may be a link
app_path=$0

# Need this for daisy-chained symlinks.
while
    APP_HOME=${app_path%"${app_path##*/}"}  # leaves a trailing /; empty if no leading path
    [ -h "$app_path" ]
do
    ls=$( ls -ld "$app_path" )
    link=${ls#*' -> '}
    case $link in             #(
      /*)   app_path=$link ;; #(
      *)    app_path=$APP_HOME$link ;;
    esac
done

# This is normally unused
# shellcheck disable=SC2034
APP_BASE_NAME=${0##*/}
APP_HOME=$( cd "${APP_HOME:-./}" && pwd -P ) || exit

# Add default JVM options here. You can also use JAVA_OPTS and GRADLE_OPTS to pass JVM options to this script.
DEFAULT_JVM_OPTS='"-Xmx64m" "-Xms64m"'

# Use the maximum available, or set MAX_FD != -1 to use that value.
MAX_FD=maximum

warn () {
    echo "$*"
} >&2

die () {
    echo
    echo "$*"
    echo
    exit 1
} >&2

# OS specific support (must be 'true' or 'false').
cygwin=false
msys=false
darwin=false
nonstop=false
case "$( uname )" in                #(
  CYGWIN* )         cygwin=true  ;; #(
  Darwin* )         darwin=true  ;; #(
  MSYS* | MINGW* )  msys=true    ;; #(
  NONSTOP* )        nonstop=true ;;
esac

CLASSPATH=$APP_HOME/gradle/wrapper/gradle-wrapper.jar


# Determine the Java command to use to start the JVM.
if [ -n "$JAVA_HOME" ] ; then
    if [ -x "$JAVA_HOME/jre/sh/java" ] ; then
        # IBM's JDK on AIX uses strange locations for the executables
        JAVACMD=$JAVA_HOME/jre/sh/java
    else
        JAVACMD=$JAVA_HOME/bin/java
    fi
    if [ ! -x "$JAVACMD" ] ; then
        die "ERROR: JAVA_HOME is set to an invalid directory: $JAVA_HOME

Please set the JAVA_HOME variable in your environment to match the
location of your Java installation."
    fi
else
    JAVACMD=java
    which java >/dev/null 2>&1 || die "ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.

Please set the JAVA_HOME variable in your environment to match the
location of your Java installation."
fi

# Increase the maximum file descriptors if we can.
if ! "$cygwin" && ! "$darwin" && ! "$nonstop" ; then
    case $MAX_FD in #(
      max*)
        # In POSIX sh, ulimit -H is undefined. That's why the result is checked to see if it worked.
        # shellcheck disable=SC3045
        MAX_FD=$( ulimit -H -n ) ||
            warn "Could not query maximum file descriptor limit"
    esac
    case $MAX_FD in  #(
      '' | soft) :;; #(
      *)
        # In POSIX sh, ulimit -n is undefined. That's why the result is checked to see if it worked.
        # shellcheck disable=SC3045
        ulimit -n "$MAX_FD" ||
            warn "Could not set maximum file descriptor limit to $MAX_FD"
    esac
fi

# Collect all arguments for the java command, stacking in reverse order:
#   * args from the command line
#   * the main class name
#   * -classpath
#   * -D...appname settings
#   * --module-path (only if needed)
#   * DEFAULT_JVM_OPTS, JAVA_OPTS, and GRADLE_OPTS environment variables.

# For Cygwin or MSYS, switch paths to Windows format before running java
if "$cygwin" || "$msys" ; then
    APP_HOME=$( cygpath --path --mixed "$APP_HOME" )
    CLASSPATH=$( cygpath --path --mixed "$CLASSPATH" )

    JAVACMD=$( cygpath --unix "$JAVACMD" )

    # Now convert the arguments - kludge to limit ourselves to /bin/sh
    for arg do
        if
            case $arg in                                #(
              -*)   false ;;                            # don't mess with options #(
              /?*)  t=${arg#/} t=/${t%%/*}              # looks like a POSIX filepath
                    [ -e "$t" ] ;;                      #(
              *)    false ;;
            esac
        then
            arg=$( cygpath --path --ignore --mixed "$arg" )
        fi
        # Roll the args list around exactly as many times as the number of
        # args, so each arg winds up back in the position where it started, but
        # possibly modified.
        #
        # NB: a `for` loop captures its iteration list before it begins, so
        # changing the positional parameters here affects neither the number of
        # iterations, nor the values presented in `arg`.
        shift                   # remove old arg
        set -- "$@" "$arg"      # push replacement arg
    done
fi

# Collect all arguments for the java command;
#   * $DEFAULT_JVM_OPTS, $JAVA_OPTS, and $GRADLE_OPTS can contain fragments of
#     shell script including quotes and variable substitutions, so put them in
#     double quotes to make sure that they get re-expanded; and
#   * put everything else in single quotes, so that it's not re-expanded.

set -- \
        "-Dorg.gradle.appname=$APP_BASE_NAME" \
        -classpath "$CLASSPATH" \
        org.gradle.wrapper.GradleWrapperMain \
        "$@"

# Stop when "xargs" is not available.
if ! command -v xargs >/dev/null 2>&1
then
    die "xargs is not available"
fi

# Use "xargs" to parse quoted args.
#
# With -n1 it outputs one arg per line, with the quotes and backslashes removed.
#
# In Bash we could simply go:
#
#   readarray ARGS < <( xargs -n1 <<<"$var" ) &&
#   set -- "${ARGS[@]}" "$@"
#
# but POSIX shell has neither arrays nor command substitution, so instead we
# post-process each arg (as a line of input to sed) to backslash-escape any
# character that might be a shell metacharacter, then use eval to reverse
# that process (while maintaining the separation between arguments), and wrap
# the whole thing up as a single "set" statement.
#
# This will of course break if any of these variables contains a newline or
# an unmatched quote.
#

eval "set -- $(
        printf '%s\n' "$DEFAULT_JVM_OPTS $JAVA_OPTS $GRADLE_OPTS" |
        xargs -n1 |
        sed ' s~[^-[:alnum:]+,./:=@_]~\\&~g; ' |
        tr '\n' ' '
    )" '"$@"'

exec "$JAVACMD" "$@"

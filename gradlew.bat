@rem
@rem Copyright 2015 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      https://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem

@if "%DEBUG%" == "" @echo off
@rem ##########################################################################
@rem
@rem  Gradle startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

@rem ##########################################################################
@rem Foundry-specific setup
@rem ##########################################################################

set _root_dir=%~dp0
set root_dir=%_root_dir:~0,-1%

if "%JEMMA%" == "" (
  setlocal EnableDelayedExpansion

  @rem If not set, default to the URIs inferred from the git remote
  for /f %%i in ('git config remote.origin.url') DO (
    set git_remote=%%i
  )

  if defined FOUNDRY_HOSTNAME (
    if defined FOUNDRY_USERNAME (
      if defined FOUNDRY_TOKEN (
        echo "Environment variables [FOUNDRY_HOSTNAME, FOUNDRY_USERNAME, FOUNDRY_TOKEN] are already set. Using them"
        set GIT_REMOTE_HOST=%FOUNDRY_HOSTNAME%
        set GIT_REMOTE_USERNAME=%FOUNDRY_USERNAME%
        set GIT_REMOTE_PASSWORD=%FOUNDRY_TOKEN%
      )
    )
  ) else (
      echo "Environment variables [FOUNDRY_HOSTNAME, FOUNDRY_USERNAME, FOUNDRY_TOKEN] are not set. Attempting to infer from Git remote url"
      call set strip_before_host=!git_remote:*@=!

      call set _git_host_and_port_beg=%%strip_before_host:*/=%%
      call set _git_host_and_port_end=%%strip_before_host:!_git_host_and_port_beg!=%%
      call set git_host_and_port=!!_git_host_and_port_end:~0,-1!!

      call set _endpart=%%git_remote:*@=%%
      call set _firstpart=%%git_remote:!_endpart!=%%
      call set strip_after_userinfo=!!_firstpart:~0,-1!

      call set git_userinfo=%%strip_after_userinfo:*//=%%

      call set git_password=!!git_userinfo:*:=!
      call set _firstpart=%%git_userinfo:!git_password!=%%
      call set git_username=!!_firstpart:~0,-1!

      set GIT_REMOTE_HOST=!git_host_and_port!
      set GIT_REMOTE_USERNAME=!git_username!
      set GIT_REMOTE_PASSWORD=!git_password!
  )

  set ORG_GRADLE_PROJECT_externalUri=https://!GIT_REMOTE_HOST!

  set ORG_GRADLE_PROJECT_bearerToken=!GIT_REMOTE_PASSWORD!
  set ORG_GRADLE_PROJECT_isRunningLocally=TRUE

  call set strip_before_stemma=!git_remote:*/stemma/git/=!
  call set repo_rid_begin=%%strip_before_stemma:*/=%%
  call set repo_rid_end=%%strip_before_stemma:!repo_rid_begin!=%%
  call set ORG_GRADLE_PROJECT_repoRid=!!repo_rid_end:~0,-1!!

  set ORG_GRADLE_PROJECT_functionExecutorApiUri=!ORG_GRADLE_PROJECT_externalUri!/function-executor/api
  set ORG_GRADLE_PROJECT_functionRegistryApiUri=!ORG_GRADLE_PROJECT_externalUri!/function-registry/api
  set ORG_GRADLE_PROJECT_ontologyMetadataApiUri=!ORG_GRADLE_PROJECT_externalUri!/ontology-metadata/api
  set ORG_GRADLE_PROJECT_compassApiUri=!ORG_GRADLE_PROJECT_externalUri!/compass/api
  set ORG_GRADLE_PROJECT_actionsApiUri=!ORG_GRADLE_PROJECT_externalUri!/actions/api
  set ORG_GRADLE_PROJECT_artifactsApiUri=!ORG_GRADLE_PROJECT_externalUri!/artifacts/api
  set ORG_GRADLE_PROJECT_opusServerApiUri=!ORG_GRADLE_PROJECT_externalUri!/opus-server/api
  set ORG_GRADLE_PROJECT_bellasoApiUri=!ORG_GRADLE_PROJECT_externalUri!/bellaso/api
  set ORG_GRADLE_PROJECT_foundryMlApiUri=!ORG_GRADLE_PROJECT_externalUri!/foundry-ml/api
  set ORG_GRADLE_PROJECT_foundryMlLiveApiUri=!ORG_GRADLE_PROJECT_externalUri!/foundry-ml-live/api
  set ORG_GRADLE_PROJECT_modelsApiUri=!ORG_GRADLE_PROJECT_externalUri!/models/api
  set ORG_GRADLE_PROJECT_webhooksApiUri=!ORG_GRADLE_PROJECT_externalUri!/webhooks/api
  set ORG_GRADLE_PROJECT_multipassApiUri=!ORG_GRADLE_PROJECT_externalUri!/multipass/api
  set ORG_GRADLE_PROJECT_jemmaApiUri=!ORG_GRADLE_PROJECT_externalUri!/jemma/api
  set ORG_GRADLE_PROJECT_magritteCoordinatorApiUri=!ORG_GRADLE_PROJECT_externalUri!/magritte-coordinator/api
  set ORG_GRADLE_PROJECT_languageModelServiceApiUri=!ORG_GRADLE_PROJECT_externalUri!/language-model-service/api
  set ORG_GRADLE_PROJECT_apiGateway=!ORG_GRADLE_PROJECT_externalUri!/api
  set ORG_GRADLE_PROJECT_corditeApiUri=!ORG_GRADLE_PROJECT_externalUri!/cordite/api
  set ORG_GRADLE_PROJECT_foundryTelemetryServiceApiUri=!ORG_GRADLE_PROJECT_externalUri!/foundry-telemetry-service/api

  if exist "!JAVA_HOME!\jre\lib\security\cacerts" (
    if not defined ORG_GRADLE_PROJECT_trustStore (
        set ORG_GRADLE_PROJECT_trustStore=!JAVA_HOME!\jre\lib\security\cacerts
    )
  ) else if exist "!JAVA_HOME!\lib\security\cacerts" (
    if not defined ORG_GRADLE_PROJECT_trustStore (
        set ORG_GRADLE_PROJECT_trustStore=!JAVA_HOME!\lib\security\cacerts
    )
  )

  set JAVA_OPTS=-Djavax.net.ssl.trustStore="!ORG_GRADLE_PROJECT_trustStore!"
  set wrapperAuthGradleOptions=-Dgradle.wrapperUser="!GIT_REMOTE_USERNAME!" -Dgradle.wrapperPassword="!GIT_REMOTE_PASSWORD!"
  if ["%GRADLE_OPTS%"]==[""] set GRADLE_OPTS=
  set GRADLE_OPTS=%GRADLE_OPTS% !wrapperAuthGradleOptions!
  set gradleDistributionUrl=!ORG_GRADLE_PROJECT_externalUri!/assets/dyn/gradle-distributions/gradle-7.6.4-bin.zip
)

set "wrapperTemplatePropsFile=%root_dir%\gradle\wrapper\gradle-wrapper.template.properties"
set "wrapperPropsFile=%root_dir%\gradle\wrapper\gradle-wrapper.properties"
if exist "%wrapperPropsFile%" del "%wrapperPropsFile%"
for /f "usebackq tokens=*" %%A in ("%wrapperTemplatePropsFile%") do (
    set "line=%%A"
    set "line=!line:${gradleDistributionUrl}=%gradleDistributionUrl%!"
    <nul set /p "=!line!" >> "%wrapperPropsFile%"
    echo.>>"%wrapperPropsFile%"
)

@rem ##########################################################################

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

@rem Resolve any "." and ".." in APP_HOME to make it shorter.
for %%i in ("%APP_HOME%") do set APP_HOME=%%~fi

@rem Add default JVM options here. You can also use JAVA_OPTS and GRADLE_OPTS to pass JVM options to this script.
set DEFAULT_JVM_OPTS="-Xmx64m" "-Xms64m"

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if "%ERRORLEVEL%" == "0" goto execute

echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto execute

echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:execute
@rem Setup the command line

set CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar


@rem Execute Gradle
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*

:end
@rem End local scope for the variables with windows NT shell
if "%ERRORLEVEL%"=="0" goto mainEnd

:fail
rem Set variable GRADLE_EXIT_CONSOLE if you need the _script_ return code instead of
rem the _cmd.exe /c_ return code!
if  not "" == "%GRADLE_EXIT_CONSOLE%" exit 1
exit /b 1

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega

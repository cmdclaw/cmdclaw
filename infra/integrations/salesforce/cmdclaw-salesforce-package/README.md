# CmdClaw Salesforce Package

This project packages the CmdClaw Salesforce External Client App as a managed 2GP
package.

## Package

- Package name: `CmdClaw`
- Package id: `0Hog50000000dUPCAY`
- Namespace: `cmdclaw`
- External Client App API name: `HeyBap`

## Current Released Version

- Subscriber Package Version Id: `04tg50000006m0LAAQ`
- Install URL: https://login.salesforce.com/packaging/installPackage.apexp?p0=04tg50000006m0LAAQ
- Sandbox install URL: https://test.salesforce.com/packaging/installPackage.apexp?p0=04tg50000006m0LAAQ

Subscriber orgs must support External Client Apps. Salesforce Starter trial orgs
can lack this feature and reject the install with missing feature errors for
`ExternalClientApplication` and `ExtlClntAppOauthSettings`.

## Commands

Retrieve the packageable External Client App metadata:

```bash
sf project retrieve start \
  --target-org cmdclaw-devhub \
  --metadata ExternalClientApplication:HeyBap \
  --metadata ExtlClntAppOauthSettings
```

Create a package version with code coverage so it can be promoted:

```bash
SF_ORG_CAPITALIZE_RECORD_TYPES=true sf package version create \
  --package CmdClaw \
  --installation-key-bypass \
  --code-coverage \
  --wait 30 \
  --target-dev-hub cmdclaw-devhub
```

Promote a package version before installing it in a production subscriber org:

```bash
sf package version promote \
  --package 04tg50000006m0LAAQ \
  --target-dev-hub cmdclaw-devhub
```

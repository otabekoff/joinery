# Code signing

The installers on the release page are not signed, so Windows SmartScreen shows "Windows protected your PC" the first time someone runs one. This page lists the ways to remove that warning and what each costs.

## Free: SignPath Foundation (open-source projects)

[SignPath Foundation](https://signpath.org) signs releases of open-source projects for free with a certificate issued to the Foundation. Joinery qualifies in principle: it is public and MIT-licensed.

1. Apply at <https://signpath.org/apply>. They review the repository; approval is not automatic and can take a while.
2. Once approved you get an organization id, a project slug and an API token.
3. Add the token as the repository secret `SIGNPATH_API_TOKEN`, and add a step after the build in `.github/workflows/release.yml` that submits the installers with the [`signpath/github-action-submit-signing-request`](https://github.com/SignPath/github-actions) action and uploads the signed files to the release.

The published installer then shows "SignPath Foundation" as the publisher. SmartScreen reputation still builds up with downloads, but the "unknown publisher" warning goes away.

## Free: Microsoft Store

Publishing through the Microsoft Store is free for individual developers, and Store packages are signed by Microsoft, so there is no SmartScreen prompt at all. It needs a Partner Center account and an MSIX package rather than the current installers.

## Free, but only for your own machines: a self-signed certificate

A certificate you create yourself removes the warning only on computers where that certificate has been installed as trusted. It is useful inside a company, not for public downloads.

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Joinery" -CertStoreLocation Cert:\CurrentUser\My
Export-Certificate -Cert $cert -FilePath joinery.cer
```

Set `bundle.windows.certificateThumbprint` in `src-tauri/tauri.conf.json` to the certificate's thumbprint and build; Tauri signs the installers during `tauri build`. Each computer must import `joinery.cer` into *Trusted People*.

## Paid

- **Azure Trusted Signing** — about USD 10 a month; signs from CI and gives immediate SmartScreen trust for verified publishers.
- **A code-signing certificate** from a certificate authority — typically USD 200–400 a year.

Both plug into Tauri as described in its [Windows signing guide](https://tauri.app/distribute/sign/windows/).

## What users can do meanwhile

On the SmartScreen dialog choose **More info → Run anyway**. The file can be checked against the SHA-256 shown on the release page.

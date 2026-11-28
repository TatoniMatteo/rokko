# Rokko user guide

Keep web applications in one window and organize them into personal, work or study workspaces.
No Rokko account is required: sign in directly to each service.

## Start here

1. Open Home and choose **Add an application**.
2. Search the catalog or choose **Custom service** and enter its HTTPS URL.
3. Check its name and choose a workspace or **Always visible**.
4. Add the application and sign in as you would in a browser.

Add a service more than once to use multiple accounts. Use independent sessions or separate workspaces to keep them apart.

## Find your way around

The dock contains workspace groups, service icons and quick actions for Home, Settings and Quick switch.
Hover over an icon to read its name. Right-click a service or workspace to open its actions.
Home provides an overview and lets you add services and workspaces. Management pages include services in hidden workspaces.

Open **Settings → User guide** to read this documentation offline. Search matches topic titles and full article text.
Choose a result to read the complete topic; clear the search to return to the current article.
You can also open the guide by searching for **User guide** in Quick switch.

## Organize workspaces and the dock

Choose **New workspace** on Home and save its name. Add services to it or move existing services from their settings.
Drag workspace groups or services to reorder them. Context menus and management pages provide alternatives for organizing services.
Collapse a group using its initial. The dock can be placed on any side of the window.

Hiding a workspace hibernates its services by default, interrupting notifications, calls and downloads.
Disable this behavior in **Settings → Service hibernation** if you want loaded services to continue running.
Services in **Always visible** remain independent of the selected workspace.

When removing a workspace that contains services, choose where to transfer them. Removing a configured service does not delete its provider account.

## Use separate accounts

A service can use an independent session or share its workspace session.
Workspace settings include Google and Microsoft account management and session-sharing options.
For example, Gmail and Calendar in a shared workspace can reuse a Google login where the provider allows it.
Another workspace keeps a separate session. Always-visible services use private sessions.
Logins from your ordinary browser are not imported automatically.

Changing workspace or session mode can require signing in again. Logging out may affect other services sharing that session.

## Search and switch applications

Press **Ctrl + K** or choose Quick switch in the dock. Search for a service, workspace or command.
Use arrow keys to select a result, Enter to open it and Escape to return.
Quick switch searches configured names, not email, messages or the contents of websites.
The documentation has its own search field for help topics.

## Show two services side by side

1. Open the first service and its service controls.
2. In **Split view**, choose a second service.
3. Return to the application to see both views.

Drag the divider to resize them, or focus it with Tab and use the left and right arrows.
The selected secondary service and split ratio are saved. Close split view to return to one service.
Each service retains its own configured session.

## Personalize Rokko

Settings lets you choose light, dark or system theme, an accent color and dock position.
Appearance and language changes are previewed: save them to keep them or cancel to restore the previous settings.
The interface supports Italian and English. Restart Rokko to apply browser-language changes to services;
a provider's account preferences may take precedence.
Service icons are discovered through favicons and can be customized in application settings.

Resource usage shows CPU and memory for services, workspaces and the whole application.
Shared processes are counted once in aggregated totals.

## Control a service

Service controls provide navigation, reload, open in external browser, editing and status information.

| Action | Effect |
|---|---|
| Mute service | Mutes the application audio; desktop notifications have separate settings. |
| Clear HTTP cache | Clears session cache while retaining cookies and site data. Confirmation lists affected services. |
| Reset service permissions | Removes notification and device grants and reloads the service; cookies are retained. |
| Suspend service | Stops the service until manual resume or application restart. |

### Hibernate and resume

Right-click a service and choose Hibernate. Use Resume in the same menu or the suspended-service page to restart it.
Login is retained, but the service stops working and receiving notifications while hibernated. Active downloads are cancelled.
Unsaved drafts held only in page memory can be lost. Some shared processes remain active for other services.
Manual suspensions are cleared when Rokko restarts.

### Automatic rules

Open **Settings → Service hibernation**. Hidden-workspace hibernation is enabled by default and takes precedence.
Showing the workspace again resumes previously loaded services. Manual suspensions remain until resumed or Rokko restarts.

All services are eligible for startup hibernation by default. Per-service startup options can include or exclude individual services.
Automatic selection does not wake a hibernated service by default: use Resume, or enable wake on selection in hibernation settings.

Configure per-service inactivity from application settings, or add advanced rules scoped to a service, workspace or all services.
Conditions include inactivity from 1 to 1440 minutes, being outside the selected workspace, startup, and local time windows.
Time windows crossing midnight belong to their starting weekday; their end time is exclusive.
Combine conditions with All or Any and save changes to apply them.
Custom rules protect visible services and can protect audio, downloads and device access.
The hidden-workspace rule takes precedence. Hibernation rules are not transferred by the current configuration export.

### Read dock status

Running services have an unmarked icon. A pause symbol means hibernated, a dim icon means not loaded and an exclamation mark indicates an error.

## Notifications, devices and downloads

Enable notifications in service settings. The test button checks Rokko's desktop notification path;
it does not certify a provider's notifications or Web Push. Check desktop Do Not Disturb settings as well.
When a service asks for camera, microphone or screen access, review its request in permissions.
Screen sharing also requires choosing a source. Device permissions are temporary and can be revoked in service permissions.
System-audio sharing is not available on Linux.

Choose a destination in the system file dialog when downloading. The Downloads page shows progress and allows cancellation.
Its history lasts until Rokko closes; saved files remain in the selected folder.

## Import and export configuration

Open **Settings → Import and export** to save a Rokko configuration or preview a file before importing.
It transfers services, workspaces, icons and appearance, without cookies, account credentials or permissions.
Keep exported files private because they contain service names and URLs.
Workspaces with matching names are associated; ambiguous duplicates must be renamed.
Choose whether to skip matching services or create additional copies, and whether to import appearance and language.
Existing services are not replaced. Shared imported services may reuse an existing destination workspace login.

### From Rambox

Open Import from Rambox in Settings. If Rambox exposes a local MCP server, enable it temporarily and enter its port and token.
Read the services, then disable the Rambox MCP server once the preview appears.
Choose services and destinations before confirming. This imports service metadata, without cookies or credentials.
The source does not provide original workspaces. Native Rambox export files are not accepted directly.

## When something goes wrong

Use Retry on a service error page or open the service in your external browser.
Clearing HTTP cache retains cookies and does not necessarily fix provider sign-in issues.
Settings can export local diagnostics for a bug report. The report uses predefined events and counts, without service names, URLs or page content.
If configuration recovery is needed, Rokko presents recovery options and archives the previous files.

### Install and update on Linux

Download the DEB matching your architecture from GitHub Releases. On compatible Ubuntu/Debian desktops, install it with `sudo apt install ./downloaded-file.deb`.
For an update, close Rokko and install the newer DEB the same way. The package includes its runtime; Node and pnpm are only needed for development.
AppImage is an alternative distribution format; use one normal installation to avoid confusing duplicate launchers.
Packages currently have no automatic updater. Configuration and browser sessions are stored separately from installed application files.

## Useful keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl + K | Quick switch. |
| Ctrl + Tab / Ctrl + Shift + Tab | Next or previous service in dock navigation order. |
| Alt + 1…9 | Open the service at that dock position. |
| Alt + Page Up / Page Down | Previous or next workspace. |
| Alt + Home | Return to Home. |

Service/workspace switching shortcuts pause in configuration pages so you can edit fields.
Use Tab and Shift + Tab to move between controls and Enter or Space to activate them.
Open **Settings → Keyboard shortcuts** for the in-app reference.

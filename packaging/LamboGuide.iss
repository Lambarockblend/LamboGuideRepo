; LamboGuide one-click installer (Inno Setup 6). Built by .github/workflows/release.yml.
; Installs the helper, then the helper installs the addon, its link folders, Questie (optional)
; and Windows autostart. No admin rights needed.
#ifndef MyVersion
  #define MyVersion "0.7.3"
#endif

[Setup]
AppId={{6C1C5E6B-6A0B-4E43-9E8C-4C4D2F1B7A10}
AppName=LamboGuide
AppVersion={#MyVersion}
AppPublisher=Lambarock
AppCopyright=Copyright (C) 2026 Lambarock
VersionInfoCompany=Lambarock
LicenseFile=..\LICENSE
DefaultDirName={localappdata}\LamboGuide\app
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=LamboGuide-Setup-{#MyVersion}
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
WizardStyle=modern
UninstallDisplayName=LamboGuide

[Languages]
Name: "tr"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
tr.Questie=Questie'yi de kur (önerilir: görev yerleri ve harita işaretleri)
en.Questie=Also install Questie (recommended: quest locations and map markers)
tr.Autostart=Yardımcı Windows ile birlikte açılsın (saatin yanında simge)
en.Autostart=Start the helper with Windows (tray icon)
tr.Installing=LamboGuide oyuna kuruluyor...
en.Installing=Installing LamboGuide into the game...
tr.WowTitle=World of Warcraft klasörü
en.WowTitle=World of Warcraft folder
tr.WowText=Boş bırakırsan kurulum oyunu kendisi bulur. Bulamazsa "World of Warcraft" klasörünü seç.
en.WowText=Leave empty and the installer finds the game itself. If it can't, pick your "World of Warcraft" folder.
tr.Restart=Önemli: WoW açıksa bir kez tamamen kapatıp yeniden aç. İlk açılışta ChatGPT girişi tarayıcıda açılır.
en.Restart=Important: if WoW is running, fully close and reopen it once. On first start the ChatGPT sign-in opens in your browser.

[Tasks]
Name: "questie"; Description: "{cm:Questie}"
Name: "autostart"; Description: "{cm:Autostart}"

[Files]
Source: "..\dist\LamboGuideHelper\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Run]
Filename: "{app}\LamboGuideHelper.exe"; Parameters: "--install {code:SetupArgs}"; StatusMsg: "{cm:Installing}"; Flags: runhidden waituntilterminated
Filename: "{app}\LamboGuideHelper.exe"; Parameters: "--tray"; Flags: nowait postinstall skipifsilent runasoriginaluser
Filename: "{app}\LamboGuideHelper.exe"; Parameters: "--tray"; Flags: nowait runasoriginaluser; Check: WizardSilent

[UninstallRun]
Filename: "{app}\LamboGuideHelper.exe"; Parameters: "--uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "LGUninstall"

[Code]
var
  WowPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  WowPage := CreateInputDirPage(wpSelectTasks, CustomMessage('WowTitle'), '', CustomMessage('WowText'), False, '');
  WowPage.Add('');
  WowPage.Values[0] := '';
end;

function SetupArgs(Param: String): String;
begin
  Result := '';
  if WizardIsTaskSelected('questie') then Result := Result + ' --questie';
  if not WizardIsTaskSelected('autostart') then Result := Result + ' --no-autostart';
  if (WowPage <> nil) and (Trim(WowPage.Values[0]) <> '') then Result := Result + ' --wow "' + WowPage.Values[0] + '"';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssDone) and not WizardSilent then MsgBox(CustomMessage('Restart'), mbInformation, MB_OK);
end;

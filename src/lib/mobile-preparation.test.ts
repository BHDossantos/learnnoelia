import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import config from '../../capacitor.config';
it('uses a supported iOS scheme and bundles an offline recovery page', () => {
 expect(config.server?.iosScheme).toBe('capacitor');
 expect(config.server?.errorPath).toBe('index.html');
 const page=readFileSync(join(String(config.webDir),String(config.server?.errorPath)),'utf8');
 expect(page).toContain('Try again'); expect(page).toContain('role="status"');
});
it('applies native permission setup idempotently without losing existing configuration', () => {
 const root=mkdtempSync(join(tmpdir(),'noelia-native-'));
 try {
  mkdirSync(join(root,'android/app/src/main'),{recursive:true}); mkdirSync(join(root,'ios/App/App'),{recursive:true});
  writeFileSync(join(root,'android/app/src/main/AndroidManifest.xml'),'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.INTERNET"/><application android:label="LearnNoelia"/></manifest>');
  writeFileSync(join(root,'ios/App/App/Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.learnnoelia.app</string></dict></plist>');
  for(const platform of ['android','ios']) for(let i=0;i<2;i++) execFileSync('python3',['scripts/mobile/prepare.py',platform,'--root',root]);
  const manifest=readFileSync(join(root,'android/app/src/main/AndroidManifest.xml'),'utf8');
  expect(manifest.match(/android.permission.CAMERA/g)).toHaveLength(1);
  expect(manifest).toContain('android.permission.INTERNET'); expect(manifest).toContain('android:required="false"');
  const plist=readFileSync(join(root,'ios/App/App/Info.plist'),'utf8');
  expect(plist.match(/NSCameraUsageDescription/g)).toHaveLength(1); expect(plist).toContain('com.learnnoelia.app'); expect(plist).toContain('NSMicrophoneUsageDescription');
 } finally { rmSync(root,{recursive:true,force:true}); }
});

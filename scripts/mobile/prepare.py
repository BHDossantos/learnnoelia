"""Apply the same native permission declarations to validation and release builds."""
import argparse
import pathlib
import plistlib
import xml.etree.ElementTree as ET

ANDROID = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', ANDROID)

def prepare(root, platform):
    if platform == 'android':
        path = root / 'android/app/src/main/AndroidManifest.xml'
        tree = ET.parse(path)
        manifest = tree.getroot()
        for permission in ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS', 'android.permission.CAMERA']:
            if not any(node.get(f'{{{ANDROID}}}name') == permission for node in manifest.findall('uses-permission')):
                ET.SubElement(manifest, 'uses-permission', {f'{{{ANDROID}}}name': permission})
        # Camera access is optional: devices without a camera can still learn.
        for feature in ['android.hardware.camera', 'android.hardware.camera.autofocus']:
            node = next((node for node in manifest.findall('uses-feature') if node.get(f'{{{ANDROID}}}name') == feature), None)
            if node is None:
                node = ET.SubElement(manifest, 'uses-feature', {f'{{{ANDROID}}}name': feature})
            node.set(f'{{{ANDROID}}}required', 'false')
        tree.write(path, encoding='utf-8', xml_declaration=True)
    else:
        path = root / 'ios/App/App/Info.plist'
        with path.open('rb') as stream:
            data = plistlib.load(stream)
        data.update({
            'NSMicrophoneUsageDescription': 'LearnNoelia uses the microphone for pronunciation practice, speaking submissions, and tutoring calls.',
            'NSSpeechRecognitionUsageDescription': 'LearnNoelia uses speech recognition to check your pronunciation.',
            'NSCameraUsageDescription': 'LearnNoelia uses the camera to photograph work for submission or grading and for tutoring calls.',
            'NSPhotoLibraryUsageDescription': 'LearnNoelia lets you attach photos of your work.',
        })
        with path.open('wb') as stream:
            plistlib.dump(data, stream, sort_keys=False)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('platform', choices=['android', 'ios'])
    parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path('.'))
    args = parser.parse_args()
    prepare(args.root, args.platform)

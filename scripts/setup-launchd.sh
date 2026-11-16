#!/usr/bin/env bash
set -e

NODE_BIN=$(which node)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_PATH="$HOME/Library/LaunchAgents/com.linkedin.freelance.agent.plist"

if [ "$1" == "--uninstall" ]; then
  echo "🛑 Removing background LaunchAgent..."
  if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "✅ Successfully uninstalled LinkedIn background agent."
  else
    echo "ℹ️ No installed LaunchAgent found."
  fi
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$PROJECT_DIR/logs"

echo "⚙️ Creating macOS background schedule plist..."
cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.linkedin.freelance.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$PROJECT_DIR/scripts/daily-pipeline.mjs</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$(dirname "$NODE_BIN")</string>
        <key>HEADLESS</key>
        <string>true</string>
    </dict>
    <key>StartCalendarInterval</key>
    <array>
        <!-- Afternoon Peak: 01:30 PM (13:30) Daily (After 12 PM, Before 8 PM) -->
        <dict>
            <key>Hour</key>
            <integer>13</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <!-- Evening Peak: 05:30 PM (17:30) Daily (After 12 PM, Before 8 PM) -->
        <dict>
            <key>Hour</key>
            <integer>17</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/logs/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/logs/launchd-err.log</string>
</dict>
</plist>
EOF

chmod 644 "$PLIST_PATH"

# Unload previous if loaded, then load fresh
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "======================================================="
echo "🎉 SUCCESS: macOS Background Daemon Scheduled!"
echo "======================================================="
echo "📁 Plist installed at: $PLIST_PATH"
echo "⏰ Scheduled Times: Every Day at 01:30 PM & 05:30 PM (After 12 PM, Before 8 PM)"
echo "📄 Logs will be written to: $PROJECT_DIR/logs/launchd.log"
echo "ℹ️ To check status: launchctl list | grep com.linkedin"
echo "ℹ️ To disable: ./scripts/setup-launchd.sh --uninstall"
echo "======================================================="

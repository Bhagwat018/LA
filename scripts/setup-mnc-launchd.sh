#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_PATH="$HOME/Library/LaunchAgents/com.mnc.career.agent.plist"

if [ "$1" == "--uninstall" ]; then
  echo "🛑 Removing MNC background LaunchAgent..."
  if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "✅ Successfully uninstalled MNC background scheduler."
  else
    echo "ℹ️ No installed MNC LaunchAgent found."
  fi
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$PROJECT_DIR/logs"

echo "⚙️ Creating macOS background schedule plist for MNC Career Sync..."
cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mnc.career.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$PROJECT_DIR/scripts/mnc-auto-sync.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$(dirname $(which node))</string>
    </dict>
    <key>StartCalendarInterval</key>
    <dict>
        <!-- Afternoon Execution: 02:00 PM (14:00) IST Daily (Between 1 PM - 4 PM) -->
        <key>Hour</key>
        <integer>14</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/logs/mnc-launchd.log</string>
    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/logs/mnc-launchd-err.log</string>
</dict>
</plist>
EOF

chmod 644 "$PLIST_PATH"

# Unload previous if loaded, then load fresh
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "======================================================="
echo "🎉 SUCCESS: MNC Career Agent Scheduled on macOS!"
echo "======================================================="
echo "📁 Plist installed at: $PLIST_PATH"
echo "⏰ Scheduled Time: Every Day at 02:00 PM (14:00 IST) [Between 1 PM and 4 PM]"
echo "📄 Logs will be written to: $PROJECT_DIR/logs/mnc-launchd.log"
echo "ℹ️ To check status: launchctl list | grep com.mnc"
echo "ℹ️ To disable: ./scripts/setup-mnc-launchd.sh --uninstall"
echo "======================================================="

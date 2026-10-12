#!/bin/bash
# ダブルクリックでローカルサーバーを起動し、ブラウザで開きます（macOS）
cd "$(dirname "$0")"
PORT=8765
( sleep 1; open "http://localhost:${PORT}/" ) &
echo "Typewriter Atelier を http://localhost:${PORT}/ で開いています。終了するにはこのウィンドウを閉じてください。"
python3 -m http.server ${PORT}

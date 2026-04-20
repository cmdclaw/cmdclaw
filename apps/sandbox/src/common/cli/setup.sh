#!/bin/bash
# Setup CLI tools with nice command names

mkdir -p ~/.local/bin

for tool in /app/cli/*.ts; do
  name=$(basename "$tool" .ts)
  wrapper=~/.local/bin/"$name"
  cat > "$wrapper" << EOF
#!/bin/bash
exec tsx $tool "\$@"
EOF
  chmod +x "$wrapper"
  if [ -w /usr/local/bin ]; then
    ln -sfn "$wrapper" /usr/local/bin/"$name"
  fi
done

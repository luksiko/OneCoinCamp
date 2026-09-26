import re
with open("worker/src/services/i18n.ts", "r") as f:
    text = f.read()

# Replace opening quote
text = re.sub(r"menu_welcome:\s*'(🚐[^']*)'", r"menu_welcome: `\1`", text)

with open("worker/src/services/i18n.ts", "w") as f:
    f.write(text)

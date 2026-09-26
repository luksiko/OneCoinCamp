import re
with open("worker/src/services/i18n.ts", "r") as f:
    text = f.read()

# I will just replace the specific broken string or just find unclosed quotes
text = text.replace("menu_welcome: '🚐 <b>Camper Monitor — перегоны кемперов за 1€</b>\\n", "menu_welcome: `🚐 <b>Camper Monitor — перегоны кемперов за 1€</b>\\n")
# Actually, wait, it's literal newlines, not escaped! Let me just use regex or manual replace

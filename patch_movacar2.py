import sys

with open("src/camper_monitor/providers.py", "r") as f:
    content = f.read()

content = content.replace("except Exception:\n            return []", "")
content = content.replace("        try:", "")

with open("src/camper_monitor/providers.py", "w") as f:
    f.write(content)

with open("tests/test_providers.py", "r") as f:
    test_content = f.read()

test_content = test_content.replace('{"data": [{"id": "123", "attributes": {"price": 100, "name": "VW Crafter"}}]}', '{"data": [{"type": "offer", "id": "123", "attributes": {"vehicle_category_name": "VW Crafter"}}], "included": [{"type": "monetary_amount", "id": "price1", "attributes": {"amount_minor_units": 10000}}]}')

with open("tests/test_providers.py", "w") as f:
    f.write(test_content)


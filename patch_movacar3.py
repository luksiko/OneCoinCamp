import sys
with open("src/camper_monitor/providers.py", "r") as f:
    lines = f.readlines()

out = []
in_movacar = False
for line in lines:
    if line.startswith("class MovacarProvider:"):
        in_movacar = True
        out.append(line)
        out.append("""    base_url = "https://crowd-api-production-615013621295.europe-west1.run.app"

    def __init__(self, http) -> None:
        self.http = http

    def fetch_destinations(self, origin_reference: str):
        import uuid, urllib.parse
        query = urllib.parse.urlencode({"locale": "de", "origin_reference": origin_reference})
        payload = self.http.get(
            f"{self.base_url}/v1/locations/offers?{query}",
            headers={
                "Accept": "application/vnd.api+json",
                "Origin": "https://movacar.com",
                "Referer": "https://movacar.com/",
                "X-Request-Id": uuid.uuid4().hex[:12],
            },
        )
        return payload.get("included", [])

    def fetch_offers(self, route, allowed_destination_countries = None):
        import uuid, urllib.parse
        from camper_monitor.main import Offer
        if route.origin_id is None:
            raise ValueError("Movacar routes require origin_id")
            
        query_params = {"locale": "en", "origin": route.origin_id}
        if route.destination_id and route.destination_id != "*":
            query_params["destination"] = route.destination_id
            
        query = urllib.parse.urlencode(query_params)
        payload = self.http.get(
            f"{self.base_url}/v1/offers?{query}",
            headers={
                "Accept": "application/vnd.api+json",
                "Origin": "https://movacar.com",
                "Referer": "https://movacar.com/",
                "X-Request-Id": uuid.uuid4().hex[:12],
            },
        )

        stations = {}
        prices = {}
        for item in payload.get("included", []):
            if item.get("type") == "station":
                stations[item.get("id")] = item.get("attributes", {})
            elif item.get("type") == "monetary_amount":
                prices[item.get("id")] = item.get("attributes", {})

        offers = []
        for item in payload.get("data", []):
            if item.get("type") != "offer":
                continue
                
            attrs = item.get("attributes", {})
            rels = item.get("relationships", {})
            
            dest_station_id = rels.get("destination", {}).get("data", {}).get("id")
            dest_station = stations.get(dest_station_id, {})
            dest_name = dest_station.get("city") or dest_station.get("alternative_city") or "Unknown"
            
            price_id = rels.get("base_price", {}).get("data", {}).get("id")
            price_info = prices.get(price_id, {})
            price_val = price_info.get("amount_minor_units", 100) / 100.0

            v_make = attrs.get("make") or attrs.get("model") or attrs.get("vehicle_category_name") or "Movacar vehicle"
            if attrs.get("model") and attrs.get("model") != v_make:
                v_make += f" {attrs.get('model')}"
                
            start_date = attrs.get("start_date") or ""
            end_date = attrs.get("end_date") or ""
            start_date = start_date.split("T")[0] if start_date else route.pickup_date
            end_date = end_date.split("T")[0] if end_date else route.return_date
            
            offer_id = attrs.get("offer_id") or item.get("id")
            
            offers.append(
                Offer(
                    offer_id=str(offer_id),
                    source="movacar",
                    vehicle=v_make.strip(),
                    price=str(price_val),
                    pickup_date=start_date,
                    return_date=end_date,
                    origin=route.origin,
                    destination=dest_name,
                    booking_url="https://movacar.com/",
                )
            )

        return offers
""")
        continue
    if in_movacar and line.startswith("class IndieCampersProvider:"):
        in_movacar = False
    
    if not in_movacar:
        out.append(line)

with open("src/camper_monitor/providers.py", "w") as f:
    f.writelines(out)

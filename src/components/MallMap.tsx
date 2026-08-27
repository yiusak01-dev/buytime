// Browser-only Leaflet map of malls. Loaded lazily inside <ClientOnly>.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";

export type MallMapPoint = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  count: number;
};

function markerIcon(count: number) {
  const hasListings = count > 0;
  return L.divIcon({
    className: "",
    html: `<div style="
      display:grid;place-items:center;
      width:30px;height:30px;border-radius:9999px;
      background:${hasListings ? "hsl(var(--primary))" : "hsl(var(--muted))"};
      color:${hasListings ? "#fff" : "hsl(var(--muted-foreground))"};
      font-size:12px;font-weight:700;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);
    ">${hasListings ? count : "·"}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => { map.invalidateSize(); }, 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

export default function MallMap({
  points,
  onSelectMall,
}: {
  points: MallMapPoint[];
  onSelectMall: (mallName: string) => void;
}) {
  const { t } = useTranslation();
  const center: [number, number] = [22.3193, 114.1694];

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl shadow-[var(--shadow-card)]">
      <MapContainer center={center} zoom={11} scrollWheelZoom className="h-full w-full">
        <InvalidateSize />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcon(p.count)}>
            <Popup>
              <div className="space-y-1.5">
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t("home.itemCount", { count: p.count })}
                </div>
                <button
                  onClick={() => onSelectMall(p.name)}
                  className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  {t("map.viewListings")}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

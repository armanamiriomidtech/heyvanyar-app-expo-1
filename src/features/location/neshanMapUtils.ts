export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

export interface NeshanMapProps {
  coordinate: MapCoordinates | null;
  editable?: boolean;
  onCoordinateSelect?: (coordinate: MapCoordinates) => void;
  onError?: () => void;
  backgroundColor: string;
  textColor: string;
  errorColor: string;
  height?: number;
}

export type NeshanMapMessage =
  | { type: 'selected'; latitude: number; longitude: number }
  | { type: 'error' };

export function createNeshanMapHtml(
  apiKey: string,
  coordinate: MapCoordinates | null,
  editable = false,
): string {
  const safeApiKey = JSON.stringify(apiKey).replace(/</g, '\\u003c');
  const center = coordinate
    ? JSON.stringify([coordinate.longitude, coordinate.latitude])
    : JSON.stringify([51.389, 35.6892]);
  const zoom = coordinate ? 15 : 12;

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://static.neshan.org/sdk/maplibre/5.24.3/neshan-maplibre-sdk.css" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    body { overflow: hidden; }
  </style>
  <script src="https://static.neshan.org/sdk/maplibre/5.24.3/neshan-maplibre-sdk.umd.js"></script>
</head>
<body>
  <div id="map"></div>
  <script>
    function send(message) {
      const payload = JSON.stringify(message);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(payload);
      } else if (window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    }

    if (!window.maplibregl || !window.maplibregl.default) {
      send({ type: 'error' });
    } else {
      const maplibregl = window.maplibregl.default;
      const map = new maplibregl.Map({
        container: 'map',
        style: 'https://static.neshan.org/sdk/maplibre/styles/light.json',
        center: ${center},
        zoom: ${zoom},
        apiKey: ${safeApiKey},
        interactive: true,
      });
      map.addControl(new maplibregl.NavigationControl());

      let marker = null;
      let errorSent = false;
      map.on('error', () => {
        if (errorSent) return;
        errorSent = true;
        send({ type: 'error' });
      });

      ${
        coordinate
          ? `marker = new maplibregl.Marker({ draggable: false }).setLngLat(${JSON.stringify([
              coordinate.longitude,
              coordinate.latitude,
            ])}).addTo(map);`
          : ''
      }

      ${
        editable
          ? `map.on('click', (event) => {
        const latitude = event.lngLat.lat;
        const longitude = event.lngLat.lng;
        const point = [longitude, latitude];

        if (marker) {
          marker.setLngLat(point);
        } else {
          marker = new maplibregl.Marker().setLngLat(point).addTo(map);
        }

        send({ type: 'selected', latitude, longitude });
      });`
          : ''
      }
    }
  </script>
</body>
</html>`;
}

export function parseNeshanMapMessage(message: string): NeshanMapMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    return null;
  }

  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.type === 'error') return { type: 'error' };
  if (data.type !== 'selected') return null;

  const { latitude, longitude } = data;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { type: 'selected', latitude, longitude };
}

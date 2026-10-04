# mapisometric

Mapa plano oscuro de El Salvador, en vista isométrica, con la flota de vehículos en 3D.

Las unidades son modelos 3D reales (three.js) dibujados dentro de la cámara del mapa: giran,
se inclinan y se iluminan junto con él, circulan por las calles cargadas y doblan en los cruces.
Toca una unidad o su etiqueta para seguirla (pin, marco de esquinas y velocidad).

Incluye el mapa (calles, edificios y volcanes) y estas unidades:

- camión de carga
- ambulancia
- patrulla
- camión de personal
- autobús
- sedán y taxi
- rastra
- volqueta
- cisterna
- camión de bomberos
- excavadora y cargador CAT
- montacargas

## Íconos para el GPS

`renderVehicleIcon(kind, { size, heading, pitch })` en `src/lib/fleet-models.ts` devuelve un PNG
(data URL) isométrico de cualquier unidad, para listas, popups o marcadores 2D.

## Correrlo

```bash
npm install
npm run dev
```

Abre http://127.0.0.1:8080

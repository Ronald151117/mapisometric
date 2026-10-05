# mapisometric

Mapa plano oscuro de El Salvador, en vista isométrica, con la flota de vehículos en 3D.

Incluye el mapa y estas unidades.

El mapa (estilo «plano», `src/lib/plano-style.ts`) tiene:

- manzanas en bloques 3D con altura real y tono según la altura, con borde azul
- calles por tipo (carretera, avenida, calle, pasaje) con líneas de carril y puentes
- línea férrea, ríos, lagos con orilla, pistas del aeropuerto
- zonas por uso: residencial, comercio, industria, hospitales, escuelas, canchas y parques
- árboles en parques y bosques
- lugares de interés con íconos (salud, escuelas, gasolineras, comida, tiendas, bancos, transporte, iglesias, PNC y bomberos, hoteles)
- nombres de calles, colonias, ciudades, departamentos, lagos y volcanes

El estilo no depende de la app: `planoLayers({ source })` sirve para cualquier mapa con el esquema OpenMapTiles.

Las unidades:

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

## Correrlo

```bash
npm install
npm run dev
```

Abre http://127.0.0.1:8080

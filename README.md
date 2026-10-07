# 💰 Gastos App

Planilla de gastos personales en la nube: anual, por categorías y en varias monedas (ARS / USD / EUR). Pensada para reemplazar la planilla de Google Sheets de siempre, pero más cómoda y sincronizada entre la compu y el celular.

**👉 Usala acá: [monster-javi.github.io/gastos-app](https://monster-javi.github.io/gastos-app/)**

---

## Qué hace

**📅 Planilla anual**
- Grilla de rubros y subcategorías por mes, que se maneja como Excel (flechas, Tab, Enter) y acepta fórmulas (`=1500+2300`).
- Cada celda puede estar en pesos, dólares o euros, y se convierte con la cotización oficial de ese mes (dolarapi.com, argentinadatos.com, frankfurter.app).
- Métodos de pago (tarjeta, efectivo, transferencia…) para no sumar dos veces lo que ya está en el resumen de la tarjeta.
- Marcar gastos como **no pagados**, notas por celda, favoritos, división de gastos entre personas y exportación a Excel.

**🧾 Lista del mes**
- Cargá gastos en texto libre (`super 15000, nafta 8000`) o desde un archivo (CSV / Excel del banco).
- Los categoriza solos y van aprendiendo de tus correcciones. Después los aprobás y se suman a la planilla.

**🤝 Deudas**
- Lo que te deben y lo que debés, en cuotas y en cualquier moneda.
- **Cuentas compartidas** para viajes o salidas: cada uno carga lo que pagó y la app calcula quién le paga a quién, con la menor cantidad de pagos.
- Resumen **por persona** que junta todo.

**🔐 Bóveda**
- Saldos de bancos, billeteras, inversiones y cripto, con cotizaciones en vivo.
- Siempre cifrada con una contraseña aparte (AES-256-GCM). Ni el servidor puede leerla.

**📑 Facturación**
- Facturas del año, con lo presupuestado, lo cobrado y lo pendiente de cobro.
- Control de topes de **Monotributo** por categoría.
- Jornadas trabajadas por mes, para armar la factura del mes siguiente.

**Y además**
- Español / inglés.
- Sincronización en tiempo real entre dispositivos.
- Funciona en el celular.
- Backup y restauración en un archivo JSON.

## Privacidad

- Cada usuario ve solo sus datos: la base (Supabase) los protege con Row Level Security.
- Cifrado opcional de extremo a extremo para toda la app, y obligatorio para la Bóveda. La contraseña de cifrado nunca sale de tu navegador; si la perdés, no hay forma de recuperar esos datos.
- La `anon key` de Supabase que aparece en el código es pública por diseño: lo que protege los datos es RLS, no esconder la key.

## Cómo está hecha

- **React + Vite**, compilada en un único `index.html` (vite-plugin-singlefile) que GitHub Pages publica tal cual.
- **Supabase** para el login (email o modo invitado), la base de datos (`kv_store`) y la sincronización en tiempo real.
- **Web Crypto API** para el cifrado (AES-256-GCM, clave derivada con PBKDF2).

Hermana de [Task App](https://github.com/monster-javi/task-app): comparten el diseño y la idea.

---

Si te sirve y querés bancar el proyecto, ¡invitame un cafecito! ☕

[![Invitame un café en cafecito.app](https://cdn.cafecito.app/imgs/buttons/button_2.svg)](https://cafecito.app/monsterjavi)  [![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/R6R51FQ52H)

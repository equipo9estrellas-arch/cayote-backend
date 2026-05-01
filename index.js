require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function add2h(hora) {
  const [h, m] = hora.split(":").map(Number);
  const date = new Date();
  date.setHours(h + 2);
  date.setMinutes(m);
  return date.toTimeString().slice(0, 5);
}

app.get("/", (req, res) => {
  res.send("Servidor funcionando");
});

app.post("/availability", async (req, res) => {
  const { fecha, hora, personas } = req.body;

  const { data: mesas, error } = await supabase
    .from("mesas")
    .select("*")
    .gte("capacidad", personas)
    .order("capacidad", { ascending: true });

  if (error) return res.status(500).json({ error });

  const hora_fin = add2h(hora);

  for (let mesa of mesas) {
    const { data: reservas, error: errRes } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha)
      .eq("mesa_id", mesa.id);

    if (errRes) continue;

    const conflicto = reservas.some(r =>
      !(hora_fin <= r.hora_inicio || hora >= r.hora_fin)
    );

    if (!conflicto) {
      return res.json({
        disponible: true,
        mesa_id: mesa.id
      });
    }
  }

  res.json({ disponible: false });
});

app.post("/reserve", async (req, res) => {
  const { nombre, telefono, fecha, hora, personas } = req.body;

  const disponibilidad = await fetch("http://localhost:3000/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fecha, hora, personas })
  });

  const data = await disponibilidad.json();

  if (!data.disponible) {
    return res.json({ ok: false });
  }

  const hora_fin = add2h(hora);

  const { error } = await supabase.from("reservas").insert([
    {
      nombre,
      telefono,
      fecha,
      hora_inicio: hora,
      hora_fin,
      personas,
      mesa_id: data.mesa_id
    }
  ]);

  if (error) return res.status(500).json({ error });

  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor activo en puerto " + PORT);
});
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";

const app = express();
app.use(cors());
app.use(express.json());
dotenv.config();

let database;
const mongoClient = new MongoClient(process.env.DATABASE_URL);
mongoClient
  .connect()
  .then(() => (database = mongoClient.db()))
  .catch((err) => console.log(err));

const now = new Date();
const hours = now.getHours().toString().padStart(2, "0");
const minutes = now.getMinutes().toString().padStart(2, "0");
const seconds = now.getSeconds().toString().padStart(2, "0");
const timeString = `${hours}:${minutes}:${seconds}`;

setInterval(() => {
  const inactiveTime = 10000;
  const query = { lastStatus: { $lt: Date.now() - inactiveTime } };

  database
    .collection("participants")
    .find(query, { projection: { name: 1 } })
    .toArray()
    .then((participants) => {
      if (participants.length < 1) return
      const names = participants.map((p) => p.name);
      const messages = names.map((name) => ({
        from: name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: timeString,
      }));
      return Promise.all([
        database.collection("participants").deleteMany(query),
        database.collection("messages").insertMany(messages),
      ]);
    })
    .catch((err) => {
      console.log(err.message);
    });
}, 15000);

app.post("/participants", (req, res) => {
  const { name } = req.body;

  const nameSchema = joi.object({
    name: joi.string().required()
  })
  const validate = nameSchema.validate(req.body)
  if (validate.error) return res.sendStatus(422);

  database
    .collection("participants")
    .findOne({ name: name })
    .then((participant) => {
      if (participant) {
        res.status(409).send("Usuário já existe!");
      } else {
        return database
          .collection("participants")
          .insertOne({ name: name, lastStatus: Date.now() })
          .then(() => {
            database
              .collection("messages")
              .insertOne({
                from: name,
                to: "Todos",
                text: "entra na sala...",
                type: "status",
                time: timeString,
              })
              .then(() => res.sendStatus(201))
              .catch((err) => res.status(500).send(err.message));
          })
          .catch((err) => res.status(500).send(err.message));
      }
    })
    .catch((err) => res.status(500).send(err.message));
});

app.get("/participants", (req, res) => {
  database
    .collection("participants")
    .find()
    .toArray()
    .then((participants) => res.send(participants))
    .catch((err) => res.status(500).send(err.message));
});

app.post("/messages", (req, res) => {
  const { user } = req.headers;
  const { to, text, type } = req.body;

  database
    .collection("participants")
    .findOne({ name: user })
    .then(() => {
      database
        .collection("messages")
        .insertOne({
          from: user,
          to: to,
          text: text,
          type: type,
          time: timeString,
        })
        .then(() => res.sendStatus(201))
        .catch((err) => res.status(500).send(err.message));
    })
    .catch((err) => res.status(500).send(err.message));
});

app.get("/messages", (req, res) => {
  const { user } = req.headers;
  const { limit } = req.query;

  if (limit && limit < 1) return res.status(422).send("Informe uma página válida!");

  const query = {
    $or: [{ to: user }, { from: user }, { to: "Todos" }, { private: false }],
  };

  if (!limit) {
    database
      .collection("messages")
      .find(query)
      .toArray()
      .then((messages) => res.send(messages.reverse()))
      .catch((err) => res.status(500).send(err.message));
  } else {
    database
      .collection("messages")
      .find(query)
      .limit(parseInt(limit))
      .toArray()
      .then((messages) => res.send(messages.reverse()))
      .catch((err) => res.status(500).send(err.message));
  }
});

app.post("/status", (req, res) => {
  const { user } = req.headers;

  database
    .collection("participants")
    .findOneAndUpdate({ name: user }, { $set: { lastStatus: Date.now() } })
    .then((participant) => {
      if (participant.value) return res.sendStatus(200);
      res.sendStatus(404);
    })
    .catch((err) => res.status(500).send(err.message));
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Rodando servidor na porta ${PORT}`));

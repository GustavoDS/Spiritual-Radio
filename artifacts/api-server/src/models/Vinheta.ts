import { Model, DataTypes, type Sequelize, type CreationOptional } from "sequelize";

export type BlocoVinheta =
  | "madrugada" | "amanhecer" | "manha" | "almoco"
  | "tarde" | "prime" | "noite" | "devocional" | "sleep";

export type TipoVinheta =
  | "abertura" | "transicao" | "encerramento"
  | "antes_de_oracao" | "antes_de_mensagem" | "antes_de_versiculo";

export const BLOCOS: BlocoVinheta[] = [
  "madrugada", "amanhecer", "manha", "almoco",
  "tarde", "prime", "noite", "devocional", "sleep",
];

export const TIPOS_VINHETA: TipoVinheta[] = [
  "abertura", "transicao", "encerramento",
  "antes_de_oracao", "antes_de_mensagem", "antes_de_versiculo",
];

export class Vinheta extends Model {
  declare id: CreationOptional<number>;
  declare channel_id: number | null;
  declare nome: string;
  declare texto: string;
  declare audio_url: string | null;
  declare duracao_sec: number | null;
  declare bloco: BlocoVinheta;
  declare tipo_vinheta: TipoVinheta;
  declare voice_id: string | null;
  declare ativo: boolean;
  declare prioridade: number;
  // Bed + SFX fields (migration 25)
  declare background_track_id: string | null; // UUID FK → background_tracks.id
  declare sfx_intro_url: string | null;
  declare sfx_outro_url: string | null;
  declare bed_volume_db: number;
  declare ducking_enabled: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initVinheta(sequelize: Sequelize): void {
  Vinheta.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      channel_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      nome: { type: DataTypes.STRING(255), allowNull: false },
      texto: { type: DataTypes.TEXT, allowNull: false },
      audio_url: { type: DataTypes.STRING(500), allowNull: true },
      duracao_sec: { type: DataTypes.INTEGER, allowNull: true },
      bloco: { type: DataTypes.STRING(50), allowNull: false },
      tipo_vinheta: { type: DataTypes.STRING(50), allowNull: false },
      voice_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "External voice ID (e.g. ElevenLabs voice_id). Used to pick the Voice record for TTS.",
      },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      prioridade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      // Bed + SFX (migration 25)
      background_track_id: {
        type: DataTypes.UUID,
        allowNull: true,
        defaultValue: null,
        comment: "FK → background_tracks.id. Bed musical played underneath the voice.",
      },
      sfx_intro_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        comment: "URL of the intro stinger SFX. Generated via ElevenLabs Sound Effects API.",
      },
      sfx_outro_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        comment: "URL of the outro stinger SFX (optional).",
      },
      bed_volume_db: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: -20,
        comment: "Bed track volume in dB (e.g. -20 = very soft background).",
      },
      ducking_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "If true, sidechaincompress ducks the bed when voice is present.",
      },
    },
    {
      sequelize,
      modelName: "Vinheta",
      tableName: "vinhetas",
      timestamps: true,
      indexes: [
        { fields: ["channel_id", "bloco", "tipo_vinheta", "ativo"] },
        { fields: ["bloco"] },
        { fields: ["tipo_vinheta"] },
        { fields: ["ativo"] },
      ],
    },
  );
}

---
name: LocalStorageProvider upload quirk
description: upload() é no-op — não copia o arquivo para o key path
---

## Comportamento
`LocalStorageProvider.upload(localPath, key)` → no-op, retorna `filePathToUrl(localPath)`.
Não copia nem move o arquivo para `env.uploadDir/key`.

`exists(key)` verifica `path.join(env.uploadDir, key)` no disco.

**Por isso:** para que `exists(key)` retorne true em desenvolvimento local, escrever o arquivo
diretamente em `path.join(env.uploadDir, key)` antes de chamar upload:

```typescript
const sfxDir = path.join(env.uploadDir, "vinhetas", "sfx");
fs.mkdirSync(sfxDir, { recursive: true });
const localPath = path.join(sfxDir, `${tipo}.mp3`); // = env.uploadDir/vinhetas/sfx/{tipo}.mp3
fs.writeFileSync(localPath, buf);
const url = await storageProvider.upload(localPath, key); // para R2: sobe e deleta local; para local: no-op
```

**Why:** VoiceService faz o mesmo — buildLocalOutputPath() escreve em uploads/audio/ (que corresponde
ao storageKey "audio/..."), então local upload funciona e a URL é estável.

## Para R2
upload(localPath, key) → AWS SDK Upload → deleta localPath → retorna https://... URL pública.
exists(key) → HeadObjectCommand → true/false.
Funciona corretamente sem nenhum workaround.

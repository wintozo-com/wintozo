# WinChat You

Отдельное приложение на базе WinChat. В этой сборке доступна **только тема WinChat You** (Material You) — обычный WinChat и WinChat Glass отключены.

- Пакет Android: `com.winchat.you`
- Версия: `6.0.2`
- Название: `WinChat You`
- Иконка/аватар: та же, что у WinChat
- Без WinPro: только лавандовая палитра, форма кнопок зафиксирована, переключатель форм скрыт
- С WinPro: доступны все палитры и все формы
- Включение You-режима зашито в `src/lib/appVariant.ts` (`APP_VARIANT = "you"`) и дублируется в `.env`

## Сборка APK

Workflow: `.github/workflows/apk-android.yml` (для отдельного репозитория с корнем в этой папке).

Если проект лежит в папке `you` внутри основного репозитория, используется корневой workflow:
`../.github/workflows/you-apk-android.yml`.

Подпись release берётся из секретов `ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Путь к keystore передаётся через `KEYSTORE_FILE` — жёсткий Windows-путь в `gradle.properties` убран.

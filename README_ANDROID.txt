Мебельный калькулятор — заготовка для сборки APK

Что это:
- веб-приложение упаковывается в Android через Capacitor;
- настройки Supabase в index.html сохранены;
- APK сборка автоматизируется через GitHub Actions.

Инструкция:
1. Создайте GitHub-репозиторий и загрузите сюда содержимое этой папки.
2. В GitHub Actions запустите workflow "Build Android APK".
3. После успешной сборки скачайте artifact app-debug.apk.

Сборка требует GitHub Actions (облачная сборка), Android SDK здесь не встроен.
Не выкладывайте закрытые ключи; Supabase publishable key в приложении является публичным ключом.

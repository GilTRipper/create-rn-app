#!/bin/bash

echo "🧹 Очистка всех кэшей и пересборка проекта..."

cd "$(dirname "$0")"

# 1. Очистка Metro bundler кэша
echo "📦 Очистка Metro bundler кэша..."
rm -rf $TMPDIR/react-*
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-*
npx react-native start --reset-cache &
METRO_PID=$!
sleep 2
kill $METRO_PID 2>/dev/null || true

# 2. Очистка node_modules и переустановка
echo "📦 Очистка node_modules..."
rm -rf node_modules
rm -rf .pnpm-store


# 3. Очистка iOS кэшей
echo "🍎 Очистка iOS кэшей..."
cd ios
rm -rf Pods
rm -rf Podfile.lock
rm -rf build
rm -rf ~/Library/Developer/Xcode/DerivedData/*
rm -rf ~/Library/Caches/CocoaPods

# 4. Очистка Android кэшей
echo "🤖 Очистка Android кэшей..."
cd ../android
rm -rf .gradle
rm -rf build
rm -rf app/build

# 5. Переустановка зависимостей
echo "📥 Переустановка зависимостей..."
cd ..
echo "⏳ Установка зависимостей (это может занять несколько минут)..."
pnpm install

# Проверка, что зависимости установлены
if [ ! -d "node_modules" ]; then
    echo "❌ Ошибка: node_modules не установлены!"
    exit 1
fi
echo "✅ Зависимости установлены"

# 6. Переустановка iOS pods
echo "🍎 Переустановка iOS pods..."
cd ios
pod deintegrate || true
pod install --repo-update

echo ""
echo "✅ Очистка завершена!"
echo ""
echo "📝 Следующие шаги:"
echo "   1. Запустите Metro bundler: pnpm start"
echo "   2. В другом терминале запустите приложение:"
echo "      - iOS: pnpm run ios"
echo "      - Android: pnpm run android"
echo ""
echo "   Или откройте проект в Xcode и сделайте Clean Build Folder (Cmd+Shift+K)"

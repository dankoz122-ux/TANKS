# ARMOR LAB — Multiplayer Module Damage

Эта сборка сохраняет игровую логику ARMOR LAB, развивает индивидуальные модели всех четырёх машин и добавляет постоянные визуальные эффекты повреждений.

## Модели

- `js/tanks/abrams.js` — более высокая широкая угловатая башня Abrams, крупные фасеточные передние щеки, компактная задняя ниша, наклонный нос корпуса, 7 катков с каждой стороны, отдельные траки и сегментированные боковые экраны.
- `js/tanks/leopard.js` — более плоская и вытянутая башня Leopard с длинным клиновидным передом, отдельными боковыми модулями и задней нишей; собственные пропорции корпуса, ходовой и крыши.
- `js/tanks/t90.js` — добавлены отдельные сегменты экранов, небольшие плитки на лобовой детали, детали бортов и вентиляционные решётки кормовой части.
- `js/tanks/merkava.js` — выделен передний силовой блок с решёткой радиатора, раздельные боковые панели и кормовые ящики/рейки; точка дыма выведена к передней решётке.

У башен применены закрытые фасеточные оболочки, а не прозрачные/открытые наборы граней. Приборы и навесные блоки закреплены на своей башне или корпусе.

## Что также поправлено

- Начальный вертикальный угол камеры перенесён чуть ниже горизонта; камера находится ближе к танку, чтобы машина была видна в кадре с начала игры.
- Сохранены WASD, мышь для наведения, плавный довод башни и орудия, оптика, снаряды с траекторией и условным пробитием, модульный урон, боты, карты, раунды, командный режим, выживание, интерфейс и конструктор.
- При повреждении двигателя дым поднимается из точки радиатора/вентиляционной решётки конкретной модели; интенсивность зависит от состояния двигателя.
- При поражении БК сначала около 1,25 секунды видны вспышки и густой дым, затем появляется взрыв и башня срывается. Уничтоженная машина продолжает гореть и дымить, пока не возродится.
- После сетевого возрождения эффекты пожара и старые следы попаданий очищаются вместе с возвратом башни и модулей.
- Добавлен `model-preview.html`: отдельная страница с четырьмя ракурсами выбранной модели для проверки геометрии. Она использует те же файлы `js/tanks/*.js`, что и игра.

## Файлы

- `index.html` — игровой интерфейс.
- `css/style.css` — стили.
- `js/game.js` — игровая логика.
- `js/tanks/*.js` — геометрия каждой машины по отдельности.
- `model-preview.html` — просмотр моделей с четырёх ракурсов.
- `server.cjs`, `start_windows.bat` — локальный сервер/запуск.

## Запуск на Windows

1. Распаковать архив в новую папку.
2. Запустить `start_windows.bat`.
3. Открыть `http://localhost:8000`.
4. Чтобы рассмотреть геометрию отдельно, открыть `http://localhost:8000/model-preview.html`.

Для загрузки Three.js с jsDelivr требуется интернет-соединение. Проверены синтаксис всех JavaScript-файлов и запуск фабрик всех четырёх моделей через тестовый набор классов геометрии. Полноценный WebGL-рендер не удалось подтвердить в этой среде, поэтому внешний вид пламени/дыма и их точное положение стоит визуально проверить в браузере.


## Multiplayer (LAN / room codes)

This build includes a simple WebSocket room server and player synchronization. No npm packages are required; the server uses Node.js built-in modules.

1. On the host PC, run `start_windows.bat`. Keep the console window open.
2. Open `http://localhost:8000`. Enter a nickname and choose a tank, then go to **РЕЖИМ → МУЛЬТИПЛЕЕР**.
3. Set a room code, e.g. `SQUAD42`, and connect. Another player uses the same code.
4. On another PC on the same Wi-Fi/LAN, open `http://HOST_LAN_IP:8000` (replace with the host PC's LAN IPv4 address), then use the same room code. Windows Firewall may ask to allow Node.js on private networks; allow it for your LAN if you trust it. The WebSocket address will auto-fill from the page hostname.
5. For players outside the LAN, the host needs an appropriately configured public server or port forwarding for TCP port 8000. Do not expose a PC to the public internet unless you understand the firewall/router implications.

### What syncs

- Room roster, nickname, tank model, team color/label.
- Chassis position and rotation, turret traverse and gun elevation (interpolated on other clients).
- Projectile visuals, player-to-player impacts, module damage, destruction and network respawn.
- A room code separates groups of players; up to 16 players per room.

The current multiplayer prototype synchronizes players and PvP events. Bots, map settings and round timers still run locally on each client; it is not yet a fully authoritative anti-cheat dedicated server. Three.js is loaded from jsDelivr, so internet access is still required for the 3D renderer.


## Multiplayer death and respawn

When a player is destroyed, the server keeps the tank in the room as a visible wreck for an 8-second respawn cooldown. The client displays a countdown and automatically returns the player to battle after the server cooldown. Respawn positions are randomized from distributed spawn pads and selected to maximize distance from other players/wrecks when possible. A manual respawn request cannot bypass the cooldown. Modules, health, and ammunition are restored on respawn.


## Система повреждений (module-based)

- Урон не вычитается из общего запаса HP. Поле `health` в сетевом протоколе используется только как флаг состояния: `100` — машина в бою, `0` — уничтожена.
- Пробитие задней половины башни считается попаданием в зону БК. При пробитии БК детонирует, машина уничтожается, а башня срывается и летит отдельно.
- Пробитие в экипаж наносит накопительный урон экипажу; потеря всего экипажа уничтожает машину, но не отрывает башню автоматически.
- Двигатель, гусеницы, привод орудия и оптика получают самостоятельные повреждения: двигатель снижает/останавливает движение, уничтожение ходовой обездвиживает машину, неисправное орудие не может стрелять, повреждение оптики ухудшает наведение. Повреждение экипажа замедляет наведение.
- Для проверки БК целься в заднюю часть башни и используй пробивающий снаряд БПС или КС. После респавна сервер восстанавливает модули, а клиент удаляет следы попаданий со своей модели; следы на удалённых машинах очищаются на сообщении о возрождении.
- В одиночной игре боты используют те же зоны модулей: критическое попадание в БК вызывает взрыв и отрыв башни; повреждение двигателя/ходовой/орудия нарушает соответствующую функцию.

Это игровая аппроксимация, а не физически точная система War Thunder. В текущем сетевом прототипе клиент определяет пересечение и передаёт выбранный модуль серверу; сервер применяет состояние повреждений и возрождение, но не рассчитывает баллистику и хит-коллизии авторитетно на сервере.

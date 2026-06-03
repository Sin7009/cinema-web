# Cinema Web — Онлайн-кинотеатр для TorrServer

**Cinema Web** — это легкий, отзывчивый и красивый веб-интерфейс в стиле Netflix (Netflix Clone), созданный специально для удобного поиска и онлайн-просмотра фильмов и сериалов непосредственно с вашего домашнего сервера **TorrServer**.

Проект работает полностью локально, не требует регистрации и авторизации и идеально подходит для хостинга на домашнем NAS под управлением Traefik.

---

## 🚀 Основные возможности

* **Стриминг торрентов «на лету»:** Воспроизведение видеопотока прямо во встроенном HTML5-плеере в браузере или в один клик во внешнем плеере (например, VLC на мобильных устройствах/ПК) без необходимости скачивать файл на жесткий диск.
* **Собственная медиатека TorrServer:**
  * Автоматический вывод всех добавленных в TorrServer торрентов на главной странице.
  * Раздел **«Недавно запущенные»** для быстрого возвращения к просмотру последних раздач.
  * Прямой запуск добавленного контента: если торрент уже есть в TorrServer, модальное окно сразу откроет вкладку воспроизведения со списком файлов/серий, минуя поиск раздач.
* **Интеграция с Jackett:** Автоматический поиск раздач на всех ваших торрент-трекерах по названию и году фильма, фильтрация по качеству (4K UHD, 1080p, 720p, HDR) и сортировка по количеству сидеров.
* **Каталог TMDB (The Movie Database):**
  * Красивые разделы «В тренде этой недели», «Популярно сейчас» и «Шедевры мирового кино» на главной странице.
  * Живой поиск фильмов по названию.
  * Подробные карточки фильмов с описаниями, жанрами, актерами и рейтингами.

---

## 🛠️ Как это работает (Архитектура)

```text
[ Браузер (Клиент) ] ➔ [ Cinema Web (Next.js) ]
                             │
                             ├─➔ [ TMDB API ] (Каталог и поиск информации)
                             ├─➔ [ Jackett ] (Поиск торрент-раздач на трекерах)
                             └─➔ [ TorrServer ] (Добавление торрентов и стриминг)
```

---

## 🔑 Учетные данные внешних сервисов

Для управления и интеграции используются следующие параметры (сохранены в конфигурации):

* **Jackett (Поисковик торрентов):**
  * **Адрес панели:** `https://jackett.nas-soft.com`
  * **Админ-пароль:** `YOUR_JACKETT_ADMIN_PASSWORD`
  * **API-ключ:** `YOUR_JACKETT_API_KEY`

---

## 📦 Запуск и развертывание

### 1. Настройка окружения

Создайте в корневой директории проекта файл `.env.local` на основе следующего шаблона:

```ini
# URL этого веб-приложения для внешнего доступа
NEXT_PUBLIC_APP_URL=https://watch.nas-soft.com

# API Ключ TMDB (The Movie Database)
TMDB_API_KEY=YOUR_TMDB_API_KEY

# Адрес API Jackett (внутренний адрес в сети Docker) и его API Key
JACKETT_API_URL=http://jackett:9117
JACKETT_API_KEY=YOUR_JACKETT_API_KEY
JACKETT_ADMIN_PASSWORD=YOUR_JACKETT_ADMIN_PASSWORD

# API TorrServer (внутренний адрес в сети Docker)
TORRSERVER_API_URL=http://torrserver:8090
```

### 2. Запуск через Docker Compose

Сервис интегрирован в общую сеть `tweb` и развертывается в связке с Traefik. Пример конфигурации в `docker-compose.yml`:

```yaml
services:
  cinema-web:
    build:
      context: ./cinema-web
      dockerfile: Dockerfile
    container_name: cinema-web
    mem_limit: 1g
    restart: unless-stopped
    env_file:
      - ./cinema-web/.env.local
    networks:
      - tweb
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.cinema.rule=Host(`watch.nas-soft.com`)"
      - "traefik.http.routers.cinema.entrypoints=websecure"
      - "traefik.http.routers.cinema.tls=true"
      - "traefik.http.routers.cinema.tls.certresolver=myresolver"
      - "traefik.http.services.cinema-svc.loadbalancer.server.port=3000"

networks:
  tweb:
    external: true
```

Для запуска выполните:

```bash
docker compose up -d --build
```

Приложение будет собрано и запущено на порту `3000` внутри контейнера, а Traefik автоматически выпустит SSL-сертификат Let's Encrypt и сделает сервис доступным по адресу `https://watch.nas-soft.com`.

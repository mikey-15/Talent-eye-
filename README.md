# NextGen Scouting System (TalentEye)

Welcome to the **NextGen Scouting System** (internally known as TalentEye) - a modern, AI-powered platform for sports talent scouting, player performance analysis, and video processing.

## 🌟 Overview
NextGen Scouting System is designed to help scouts, coaches, and sports organizations analyze player performance mathematically and visually. It leverages state-of-the-art computer vision models (like YOLOv8 and MediaPipe Pose Landmarker) to track player movements, process videos, and evaluate drills or gameplay. 

## 🏗️ Architecture
The platform is structured into two main components:
- **Backend**: A robust Python/Django REST API that handles authentication, database operations, media uploads, and AI inference tasks.
- **Frontend**: A cross-platform Angular/Ionic application providing web, mobile-web, and native mobile interfaces for users (Players, Scouts, and Coaches).

## 🚀 Features
- **Role-Based Access**: Specialized dashboards and tools for Players, Scouts, and Coaches.
- **AI Engine (`super_mikella_engine`)**: Processes uploaded videos to identify players and track key biomechanical and performance metrics.
- **Video Analysis**: Automated drill analysis, bounding box annotations, and performance insights.
- **Player Profiles**: Detailed performance profiles with historical tracking and scouting reports.
- **Scouting Tools**: Shortlisting, comparing players, and managing scouting metrics and reports.
- **Scalable Workloads**: RabbitMQ / Celery support for asynchronous AI video processing tasks.

---

## 🛠️ Tech Stack & Setup

### Backend (Django)
**Prerequisites**: Python 3.9+

**Installation**:
1. Navigate to the backend directory:
   ```bash
   cd backend/talenteye
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run migrations:
   ```bash
   python manage.py migrate
   ```
5. Start the development server:
   ```bash
   python manage.py runserver
   ```

### Frontend (Angular/Ionic)
**Prerequisites**: Node.js v18+, Angular CLI, Ionic CLI

**Installation**:
1. Navigate to the frontend directory:
   ```bash
   cd frontend-angular/talenteye-frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   ng serve
   # OR for Ionic testing
   ionic serve
   ```

---

## 📂 Project Structure
- `/backend/talenteye/` - The main Django project configuration.
  - `ai_engine/` - Machine learning models (YOLO, Pose Landmarking) and video processing workers.
  - `accounts/` - User authentication, roles, and profiles.
  - `players/` - Player metrics, rating systems, and dashboards.
  - `scouts/` - Scouting tools, candidate shortlisting, and reports.
  - `videos/` - Video uploading, streaming, and results.
  - `metrics/`, `drills/`, `analysis/` - Domain-specific data modeling.
- `/frontend-angular/talenteye-frontend/` - Angular & Ionic frontend application.
  - `src/app/components/` - UI components divided by domain (auth, dashboard, player-profile, scout, videos).
  - `src/app/services/` - API integration and frontend business logic.

## 🤝 Contributing
1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## 📜 License
Currently proprietary software. Under active development.
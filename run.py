"""이음(EUM) 플랫폼 실행 진입점. `python run.py` 로 기동."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=5959, reload=False)

import os
import time
from typing import Optional, Tuple

from .super_mikella_engine import run_engine_on_video


def process_media(input_path: str, output_json_path: Optional[str] = None, output_video_path: Optional[str] = None,
                  headless: bool = True, display_scale: float = 0.6) -> Tuple[dict, str, Optional[str]]:
    """High-level wrapper used by Django/Celery.

    Returns (scouting_report_dict, output_json_path, output_video_path)
    """
    if output_json_path is None:
        ts = int(time.time())
        output_json_path = os.path.join(os.getcwd(), f'mikella_scouting_{ts}.json')

    report, annotated_path = run_engine_on_video(
        input_path,
        output_json_path=output_json_path,
        output_video_path=output_video_path,
        headless=headless,
        display_scale=display_scale,
    )
    return report, output_json_path, annotated_path

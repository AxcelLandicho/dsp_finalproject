# Student Head Grooming Detection System

A local school gate system for checking student head grooming compliance.

The guard confirms the Roboflow API settings, starts the live feed, and the system checks the head region for:

- improper haircut
- headwear
- bright dyed hair
- untied long hair for male students
- detected gender, if your model was trained with gender labels

The app uses your trained Roboflow model through the Roboflow Hosted API. Enter your Roboflow API key and project ID in the dashboard. The backend sends live camera frames to Roboflow, receives object-detection predictions, then applies the school grooming rules. The Roboflow model version is fixed to `1` in the app.

## Folder Architecture

```text
dsp/
  app/
    __init__.py
    detector.py          # Roboflow Hosted API client
    main.py              # FastAPI server and API routes
    rules.py             # school grooming violation logic
    schemas.py           # shared response/request models
  config/
    grooming_rules.json  # editable class-to-rule mapping
  logs/
    .gitkeep             # runtime CSV logs are written here
  static/
    app.js               # live feed, API calls, overlay drawing
    index.html           # guard camera dashboard
    styles.css           # school-gate UI design
  requirements.txt
  README.md
```

## Free Tools Used

- Python
- FastAPI
- OpenCV
- Roboflow Hosted API
- Browser camera API
- HTML, CSS, JavaScript

## Setup

Create a virtual environment. Python 3.10 to 3.12 is recommended:

```bash
/opt/homebrew/bin/python3.12 -m venv .venv
source .venv/bin/activate
```

If `python3.12` is already your default Python, this also works:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

For Roboflow mode, run the server and fill these fields in the web dashboard:

- API Key
- Project ID, also called the project slug

After entering them, click `Confirm API`. The scan controls stay disabled until the Roboflow details are confirmed. If you need to edit them, click `Change API`, update the fields, then confirm again.

## Live Feed

The system only uses live feed. It opens the webcam and analyzes frames repeatedly for real-time gate checking. This sends repeated requests to Roboflow Hosted API, so it can use Roboflow credits continuously while the feed is running.

Run the system:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000
```

## Expected Model Labels

Your trained model can use these labels directly:

- `male`
- `female`
- `proper_haircut`
- `improper_haircut`
- `headwear_detected`
- `no_headwear`
- `hair_tied`
- `hair_not_tied`
- `natural_hair_color`
- `dyed_bright_color`

If your dataset used different class names such as `male_student`, `female_student`, `cap`, `hat`, `bright_hair`, or `long_hair_untied`, edit `config/grooming_rules.json` and add those labels to the right rule list.

Gender is automatic now. That means the model must output a gender class. If the dataset/model does not include gender labels, the dashboard will show `Unknown`, and the male-only `hair_not_tied` rule will not be applied confidently.

## How The Decision Works

The backend receives an image frame and sends it to Roboflow.

In Roboflow mode, it calls:

```text
https://detect.roboflow.com/{project_id}/{version}
```

with your API key and the live frame. It converts Roboflow's `x`, `y`, `width`, and `height` predictions into boxes for the dashboard overlay.

Then it applies these rules:

- headwear detected = violation
- improper haircut = violation
- bright dyed hair = violation
- detected male + untied long hair = violation
- otherwise = pass

The frontend shows:

- real-time live feed
- detection boxes
- detected gender
- PASS or VIOLATION decision
- specific reasons
- recent gate check log

## Testing Checklist

1. Enter Roboflow API key and project ID.
2. Click `Confirm API`.
3. Start `Live Feed` and watch the result update from repeated frames.
4. Check each condition one by one:
   - acceptable haircut
   - improper haircut
   - headwear
   - bright dyed hair
   - male detection
   - female detection
   - male long hair tied
   - male long hair untied
5. Adjust `confidence_threshold` in `config/grooming_rules.json`.
6. Review logs in `logs/gate_events.csv`.
# dsp_finalproject

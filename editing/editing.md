Work trial with Clay

## Exploring Editing

We have thus far done very little to explore our model’s “editing” capabilities. That said here’s an experiment we’ve done, where:

- We controlled for the same seed
- Added 500 SF to the top line area and added an office to the prompt
- The result was a very similar design but adapted to be larger with an office.  The SF delta was directionally correct (~350 sqft) but not exact
- We have not explored the effects of other parameters, prompt structure (such as room ordering, room sizing), etc for this usecase.

![image.png](attachment:149f28b2-4857-49da-852b-0ed0bd8a3a82:image.png)

## Project Goal

- Gain greater understanding of any editing capabilities using **Drafted’s current production model**
- Design and prototype draft-editing features that clearly set user expectations about the model while still delivering a valuable user experience

## TLDR Life of generation

![image.png](attachment:8dbe18c8-3ede-489e-a7ce-1bc97b6780ba:image.png)

## Model Setup & Our current prompt structure

### 1. Requesting an image

We have our production model hosted on Runpod for this exploration.  Here’s the curl command to make a request:

```bash
curl 
	-X POST http://runpod_api_endpoint_here \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "your text prompt here",
    "num_steps": 30,
    "guidance_scale": 7.5,
    "seed": 42,
    "resolution": 768
  }' \
```

The expected response: 

```json
{
  "id": "20250113_143022_123456_abc123",
  "prompt": "your text prompt here",
  "image_jpg_base64": "/9j/4AAQSkZJRg...",
  "num_steps": 30,
  "guidance_scale": 7.5,
  "seed": 42,
  "device": "cuda:0",
  "elapsed_s": 2.345,
  "resolution": 768
}
```

You can append to the end of the original request the following command to have it directly give you the base64 image part of the response as a jpg image.

```json
   | jq -r '.image_jpg_base64' | base64 -d > output.jpg
```

### 2. Request parameters

The json payload you send with each request can have the following parameters:

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| prompt | string | required | Raw text prompt for generation |
| num_steps | int | 30 | Diffusion steps (1-150) |
| guidance_scale | float | 7.5 | CFG scale (0-30) |
| seed | int | random | Random seed (0 to 2^32-1) |
| resolution | int | 768 | Output resolution (256-1024) |

### 3. Typical text prompt structure

```
area = 4487 sqft

primary bed = suite
primary bath = spa
primary closet = showroom
bed + closet = standard
bed + closet = standard
bath = powder
dining = everyday
garage = tandem
kitchen = galley
laundry = hatch
living = lounge
office = workroom
outdoor living = terrace
pantry = shelf
pool = lap
```

Currently the prompt is purely about a room list and their overall size.  Here are some things to note:

1. While the users see standard t-shirt sizes (S, M, L, etc) - the prompt maps them to an internal sizing index unique to each room type  (ex: “petite”, “gallery”, “showroom” is S, M, L for primary closets). 
2. All of the size indexes per room type map to specific sqft ranges, captured in the following canonical json:
    
    [rooms.json](attachment:c775b107-c5d0-456d-bcde-9de345af1a54:rooms.json)
    
3. Currently for the overall area we append at the beginning of the prompt, we tally the midpoints of each of the ranges, and apply a 15% markup to account for hallways and walls. 

<aside>
⚠️

**There is a 77-token limit to the text prompt currently**

- The current production model uses CLIP tokenization, and is only able to accept 77 token context limit.
- You’ll need a CLIP compatible BPE tokenizer to count the amount of tokens and ensure your prompts are within that.  Otherwise, it will just truncate the prompt.
</aside>

<aside>
⚠️

**The order of rooms in the prompt is important**

- primary bed → primary bath → primary closet → bed + closet → the rest of the rooms in alphabetical order
- It’s been observed that if the prompt does not obey this order, the adherence deteriorates.
</aside>

```json
Command to call it (the :
curl -X POST "https://x9n58gfr0xhzky-8080.proxy.runpod.net/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": “…”,
    "num_steps": 30,
    "seed": 42
  }'

response format:
{
  "id": "20260114_173535_602604_4fd309",
  "prompt": "area = 1075 sqft\nprimary bed = retreat\n...",
  "num_steps": 30,
  "guidance_scale": 7.5,
  "seed": 42,
  "device": "cuda:0",
  "elapsed_s": 2.26,
  "resolution": 768,
  "output": {
    "ok": true,
    "svg": "<svg>...</svg>",
    "rooms": [
      {
        "room_type": "primary_bedroom",
        "canonical_key": "primary_bedroom",
        "area_sqft": 167.33,
        "width_inches": 144.0,
        "height_inches": 186.0
      },
      {
        "room_type": "kitchen",
        "canonical_key": "kitchen",
        "area_sqft": 133.72,
        "width_inches": 166.0,
        "height_inches": 116.0
      }
      // ... more rooms
    ],
    "rooms_unmerged": [
    ],
    "total_area_sqft": 903.03,
    "error": null
  }
}
```
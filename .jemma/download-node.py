#!/usr/bin/env python3
import os
import sys
import requests

REQUEST_TIMEOUT_SECONDS = 300

if __name__ == "__main__":
    url = sys.argv[1]
    filename = sys.argv[2]
    token = sys.argv[3]
    save_path = os.path.join(os.getcwd(), filename)

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()

    with open(save_path, "wb") as out_file:
        out_file.write(response.content)

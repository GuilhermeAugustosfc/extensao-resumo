endpoint comentarios youtube
chave api no exemplo

curl -G 'https://www.googleapis.com/youtube/v3/commentThreads' --data-urlencode 'part=snippet' --data-urlencode 'videoId=mtnw12Zy6EA' --data-urlencode 'order=relevance' --data-urlencode 'key=AIzaSyBTYDX0cjaj1OuCnpvQ9OUBKaLywqB-bbM'






API_KEY="YOUR_API_KEY"

curl \
  -X POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY} \
  -H 'Content-Type: application/json' \
  -d @<(echo '{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "INSERT_INPUT_HERE"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 1,
    "topK": 40,
    "topP": 0.95,
    "maxOutputTokens": 8192,
    "responseMimeType": "text/plain"
  }
}')
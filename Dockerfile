FROM denoland/deno:1.15.3
EXPOSE 8080 
WORKDIR /app
USER deno
COPY . .
RUN deno cache duifje.js
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "duifje.js"]

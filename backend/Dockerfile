FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY server-app/build/libs/server-app-*-all.jar app.jar

ENV PORT=8080
ENV DB_PATH=/data/rikkahub.db

EXPOSE 8080

VOLUME /data

ENTRYPOINT ["java", "-jar", "app.jar"]
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY Visualiza.sln ./
COPY src ./src
COPY tests ./tests

RUN dotnet restore Visualiza.sln
RUN dotnet publish src/Visualiza.Api/Visualiza.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "Visualiza.Api.dll"]

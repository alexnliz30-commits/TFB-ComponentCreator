// Visualiza — infraestructura Azure para el despliegue del Entregable 4.
//
// Recursos provisionados:
//   - App Service Plan (Linux, B1)
//   - Web App para el backend (containerizado, lee imagen desde GHCR)
//   - PostgreSQL Flexible Server (B1ms, 14)
//   - Key Vault con el secreto JWT, el código del constructor y la clave de Claude
//   - Application Insights para telemetría
//
// Despliegue:
//   az deployment group create -g <rg> -f infra/main.bicep -p backendImage=ghcr.io/<owner>/visualiza-backend:latest

param location string = resourceGroup().location
param namePrefix string = 'visualiza'
param backendImage string
param postgresAdminUser string = 'visualiza'
@secure()
param postgresAdminPassword string
@secure()
param jwtSecret string
@secure()
@description('Código de acceso al constructor (RF11). Vacío deja el constructor cerrado.')
param designerAccessCode string
@secure()
@description('Clave de la API de Claude (Anthropic). Vacía deja el generador en modo mock.')
param anthropicApiKey string = ''

var planName     = '${namePrefix}-plan'
var apiName      = '${namePrefix}-api'
var pgName       = '${namePrefix}-pg'
var kvName       = '${namePrefix}-kv'
var appInsName   = '${namePrefix}-ai'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: { name: 'B1', tier: 'Basic' }
  properties: { reserved: true }
}

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: pgName
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '14'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource pgDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  name: 'visualiza'
  parent: pg
}

resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  name: 'AllowAzureServices'
  parent: pg
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsName
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', Request_Source: 'rest' }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
  }
}

resource kvJwtSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'JwtSecret'
  parent: kv
  properties: { value: jwtSecret }
}

// El código del constructor va al mismo Key Vault que el secreto de firma: es
// la credencial que abre la generación con IA, así que merece el mismo trato.
resource kvDesignerCode 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'DesignerAccessCode'
  parent: kv
  properties: { value: designerAccessCode }
}

// La clave de Claude va al mismo Key Vault. Sin ella la Web App arrancaba con
// `Anthropic:UseMock` en su valor por defecto (true, de appsettings.json) y el
// despliegue generaba componentes del mock creyendo usar la IA: el fallo no daba
// error, devolvía piezas enlatadas. Se despliega solo si se ha pasado la clave.
resource kvAnthropicKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(anthropicApiKey)) {
  name: 'AnthropicApiKey'
  parent: kv
  properties: { value: anthropicApiKey }
}

// Con clave: la lee del Key Vault y desactiva el mock. Sin clave: no se inventa
// una referencia a un secreto que no existe —la Web App no arrancaría— y se deja
// el mock explícito, que es lo que de verdad va a ocurrir.
var anthropicSettings = empty(anthropicApiKey) ? [
  { name: 'Anthropic__UseMock', value: 'true' }
] : [
  { name: 'Anthropic__ApiKey', value: '@Microsoft.KeyVault(VaultName=${kv.name};SecretName=AnthropicApiKey)' }
  { name: 'Anthropic__UseMock', value: 'false' }
]

resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: apiName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${backendImage}'
      appSettings: concat([
        { name: 'WEBSITES_PORT', value: '8080' }
        { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
        { name: 'ConnectionStrings__Postgres', value: 'Host=${pg.properties.fullyQualifiedDomainName};Database=visualiza;Username=${postgresAdminUser};Password=${postgresAdminPassword};SslMode=Require' }
        { name: 'Jwt__Issuer', value: 'visualiza' }
        { name: 'Jwt__Audience', value: 'visualiza-client' }
        { name: 'Jwt__Secret', value: '@Microsoft.KeyVault(VaultName=${kv.name};SecretName=JwtSecret)' }
        { name: 'Designer__AccessCode', value: '@Microsoft.KeyVault(VaultName=${kv.name};SecretName=DesignerAccessCode)' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
      ], anthropicSettings)
    }
  }
  dependsOn: [ pgFirewallAzure, pgDb ]
}

output backendUrl string = 'https://${api.properties.defaultHostName}'
output postgresFqdn string = pg.properties.fullyQualifiedDomainName

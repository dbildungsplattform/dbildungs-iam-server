{{- define "dbildungs-iam-server-backend-envs" }}
- name: DB_SECRET
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: db-password
- name: DB_USERNAME
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: db-username
- name: DB_HOST
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: db-host
- name: DB_CLIENT_URL
  value: "postgres://$(DB_HOST)/"
- name: KC_ADMIN_SECRET
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: keycloak-adminSecret
- name: KC_CLIENT_SECRET
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: keycloak-clientSecret
- name: KC_SERVICE_CLIENT_PRIVATE_JWKS
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: service-account-private-jwks
- name: FRONTEND_SESSION_SECRET
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: frontend-sessionSecret
- name: ITSLEARNING_USERNAME
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: itslearning-username
- name: ITSLEARNING_PASSWORD
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: itslearning-password
- name: LDAP_BIND_DN
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: ldap-bind-dn
- name: LDAP_ADMIN_PASSWORD
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: ldap-admin-password
- name: PI_ADMIN_USER
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: pi-admin-user
- name: PI_ADMIN_PASSWORD
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: pi-admin-password
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: redis-password
- name: OX_PASSWORD
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: ox-password
- name: VIDIS_API_CLIENT_ID
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: vidis-api-client-id
- name: VIDIS_API_CLIENT_SECRET
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: vidis-api-client-secret
- name: METRICS_BASIC_AUTH
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: auth
- name: INTERNAL_COMMUNICATION_API_KEY
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: internal-communication-api-key
- name: IMPORT_PASSPHRASE_SALT
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: import-passphrase-salt
- name: IMPORT_PASSPHRASE_SECRET
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.auth.existingSecret .Values.auth.secretName }}
        key: import-passphrase-secret
- name: KAFKA_BROKER
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.kafka.existingSecret "" }}
        key: kafka_broker
{{- end}}

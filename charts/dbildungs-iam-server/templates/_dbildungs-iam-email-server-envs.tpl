{{- define "dbildungs-iam-server-email-backend-envs" }}
- name: DB_SECRET
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.emailMicroserviceAuth.existingSecret .Values.emailMicroserviceAuth.secretName }}
        key: db-password
- name: DB_USERNAME
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.emailMicroserviceAuth.existingSecret .Values.emailMicroserviceAuth.secretName }}
        key: db-username
- name: DB_HOST
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.emailMicroserviceAuth.existingSecret .Values.emailMicroserviceAuth.secretName }}
        key: db-host
- name: DB_CLIENT_URL
  value: "postgres://$(DB_HOST)/"
- name: LDAP_BIND_DN
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.emailMicroserviceAuth.existingSecret .Values.emailMicroserviceAuth.secretName }}
        key: ldap-bind-dn
- name: LDAP_ADMIN_PASSWORD
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.emailMicroserviceAuth.existingSecret .Values.emailMicroserviceAuth.secretName }}
        key: ldap-admin-password
- name: LDAP_UNDI_BIND_DN
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.emailMicroserviceAuth.existingSecret .Values.emailMicroserviceAuth.secretName }}
        key: ldap-undi-bind-dn
- name: LDAP_UNDI_ADMIN_PASSWORD
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.emailMicroserviceAuth.existingSecret .Values.emailMicroserviceAuth.secretName }}
        key: ldap-undi-admin-password
- name: OX_PASSWORD
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.emailMicroserviceAuth.existingSecret .Values.emailMicroserviceAuth.secretName }}
        key: ox-password
- name: INTERNAL_COMMUNICATION_API_KEY
  valueFrom:
    secretKeyRef:
        name: {{ default .Values.emailMicroserviceAuth.existingSecret .Values.emailMicroserviceAuth.secretName }}
        key: internal-communication-api-key
{{- end}}

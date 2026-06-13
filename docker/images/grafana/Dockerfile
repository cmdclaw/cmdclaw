FROM grafana/grafana:13.0.2

USER root

COPY --chown=472:0 provisioning /etc/grafana/provisioning
COPY --chown=472:0 dashboards /etc/grafana/dashboards

USER 472

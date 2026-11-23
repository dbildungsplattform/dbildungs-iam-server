#!/bin/bash
echo "start required services"
docker compose up -d

echo "waiting for services"
sleep 10

echo "start backend service"
docker compose --profile backend up -d

echo "creating certificate for ingress"
pushd nginx || exit 1
./create-cert.sh
popd || exit 1

echo "start frontend and ingress services"
docker compose --profile frontend up -d
sleep 5

# ingress will often try to use the ip of a container that was killed during startup
# reloading makes nginx re-resolve names and get the correct ip
echo "signal ingress to reload"
docker compose exec -it ingress nginx -s reload

echo "init db"
docker compose --profile db-seed up -d

docker compose ps

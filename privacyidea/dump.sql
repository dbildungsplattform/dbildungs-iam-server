/*!999999\- enable the sandbox mode */
-- MariaDB dump 10.19-11.4.2-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database:
-- ------------------------------------------------------
-- Server version	11.4.2-MariaDB-ubu2404

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Current Database: `ducsxqm001`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `ducsxqm001` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci */;

USE `ducsxqm001`;

--
-- Sequence structure for `audit_seq`
--

DROP SEQUENCE IF EXISTS `audit_seq`;
CREATE SEQUENCE `audit_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`audit_seq`, 1001, 0);

--
-- Sequence structure for `authcache_seq`
--

DROP SEQUENCE IF EXISTS `authcache_seq`;
CREATE SEQUENCE `authcache_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`authcache_seq`, 1, 0);

--
-- Sequence structure for `caconfig_seq`
--

DROP SEQUENCE IF EXISTS `caconfig_seq`;
CREATE SEQUENCE `caconfig_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`caconfig_seq`, 1, 0);

--
-- Sequence structure for `caconnector_seq`
--

DROP SEQUENCE IF EXISTS `caconnector_seq`;
CREATE SEQUENCE `caconnector_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`caconnector_seq`, 1, 0);

--
-- Sequence structure for `challenge_seq`
--

DROP SEQUENCE IF EXISTS `challenge_seq`;
CREATE SEQUENCE `challenge_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`challenge_seq`, 1, 0);

--
-- Sequence structure for `clientapp_seq`
--

DROP SEQUENCE IF EXISTS `clientapp_seq`;
CREATE SEQUENCE `clientapp_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`clientapp_seq`, 1, 0);

--
-- Sequence structure for `customuserattribute_seq`
--

DROP SEQUENCE IF EXISTS `customuserattribute_seq`;
CREATE SEQUENCE `customuserattribute_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`customuserattribute_seq`, 1, 0);

--
-- Sequence structure for `eventcounter_seq`
--

DROP SEQUENCE IF EXISTS `eventcounter_seq`;
CREATE SEQUENCE `eventcounter_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`eventcounter_seq`, 1, 0);

--
-- Sequence structure for `eventhandler_seq`
--

DROP SEQUENCE IF EXISTS `eventhandler_seq`;
CREATE SEQUENCE `eventhandler_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`eventhandler_seq`, 1, 0);

--
-- Sequence structure for `eventhandlercond_seq`
--

DROP SEQUENCE IF EXISTS `eventhandlercond_seq`;
CREATE SEQUENCE `eventhandlercond_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`eventhandlercond_seq`, 1, 0);

--
-- Sequence structure for `eventhandleropt_seq`
--

DROP SEQUENCE IF EXISTS `eventhandleropt_seq`;
CREATE SEQUENCE `eventhandleropt_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`eventhandleropt_seq`, 1, 0);

--
-- Sequence structure for `machineresolver_seq`
--

DROP SEQUENCE IF EXISTS `machineresolver_seq`;
CREATE SEQUENCE `machineresolver_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`machineresolver_seq`, 1, 0);

--
-- Sequence structure for `machineresolverconf_seq`
--

DROP SEQUENCE IF EXISTS `machineresolverconf_seq`;
CREATE SEQUENCE `machineresolverconf_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`machineresolverconf_seq`, 1, 0);

--
-- Sequence structure for `machinetoken_seq`
--

DROP SEQUENCE IF EXISTS `machinetoken_seq`;
CREATE SEQUENCE `machinetoken_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`machinetoken_seq`, 1, 0);

--
-- Sequence structure for `machtokenopt_seq`
--

DROP SEQUENCE IF EXISTS `machtokenopt_seq`;
CREATE SEQUENCE `machtokenopt_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`machtokenopt_seq`, 1, 0);

--
-- Sequence structure for `monitoringstats_seq`
--

DROP SEQUENCE IF EXISTS `monitoringstats_seq`;
CREATE SEQUENCE `monitoringstats_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`monitoringstats_seq`, 1, 0);

--
-- Sequence structure for `periodictask_seq`
--

DROP SEQUENCE IF EXISTS `periodictask_seq`;
CREATE SEQUENCE `periodictask_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`periodictask_seq`, 1, 0);

--
-- Sequence structure for `periodictasklastrun_seq`
--

DROP SEQUENCE IF EXISTS `periodictasklastrun_seq`;
CREATE SEQUENCE `periodictasklastrun_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`periodictasklastrun_seq`, 1, 0);

--
-- Sequence structure for `periodictaskopt_seq`
--

DROP SEQUENCE IF EXISTS `periodictaskopt_seq`;
CREATE SEQUENCE `periodictaskopt_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`periodictaskopt_seq`, 1, 0);

--
-- Sequence structure for `policy_seq`
--

DROP SEQUENCE IF EXISTS `policy_seq`;
CREATE SEQUENCE `policy_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`policy_seq`, 1, 0);

--
-- Sequence structure for `policycondition_seq`
--

DROP SEQUENCE IF EXISTS `policycondition_seq`;
CREATE SEQUENCE `policycondition_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`policycondition_seq`, 1, 0);

--
-- Sequence structure for `privacyideaserver_seq`
--

DROP SEQUENCE IF EXISTS `privacyideaserver_seq`;
CREATE SEQUENCE `privacyideaserver_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`privacyideaserver_seq`, 1, 0);

--
-- Sequence structure for `pwreset_seq`
--

DROP SEQUENCE IF EXISTS `pwreset_seq`;
CREATE SEQUENCE `pwreset_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`pwreset_seq`, 1, 0);

--
-- Sequence structure for `radiusserver_seq`
--

DROP SEQUENCE IF EXISTS `radiusserver_seq`;
CREATE SEQUENCE `radiusserver_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`radiusserver_seq`, 1, 0);

--
-- Sequence structure for `realm_seq`
--

DROP SEQUENCE IF EXISTS `realm_seq`;
CREATE SEQUENCE `realm_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`realm_seq`, 1001, 0);

--
-- Sequence structure for `resolver_seq`
--

DROP SEQUENCE IF EXISTS `resolver_seq`;
CREATE SEQUENCE `resolver_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`resolver_seq`, 1001, 0);

--
-- Sequence structure for `resolverconf_seq`
--

DROP SEQUENCE IF EXISTS `resolverconf_seq`;
CREATE SEQUENCE `resolverconf_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`resolverconf_seq`, 1001, 0);

--
-- Sequence structure for `resolverrealm_seq`
--

DROP SEQUENCE IF EXISTS `resolverrealm_seq`;
CREATE SEQUENCE `resolverrealm_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`resolverrealm_seq`, 1001, 0);

--
-- Sequence structure for `serviceid_seq`
--

DROP SEQUENCE IF EXISTS `serviceid_seq`;
CREATE SEQUENCE `serviceid_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`serviceid_seq`, 1, 0);

--
-- Sequence structure for `smsgateway_seq`
--

DROP SEQUENCE IF EXISTS `smsgateway_seq`;
CREATE SEQUENCE `smsgateway_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`smsgateway_seq`, 1, 0);

--
-- Sequence structure for `smsgwoption_seq`
--

DROP SEQUENCE IF EXISTS `smsgwoption_seq`;
CREATE SEQUENCE `smsgwoption_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`smsgwoption_seq`, 1, 0);

--
-- Sequence structure for `smtpserver_seq`
--

DROP SEQUENCE IF EXISTS `smtpserver_seq`;
CREATE SEQUENCE `smtpserver_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`smtpserver_seq`, 1, 0);

--
-- Sequence structure for `subscription_seq`
--

DROP SEQUENCE IF EXISTS `subscription_seq`;
CREATE SEQUENCE `subscription_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`subscription_seq`, 1, 0);

--
-- Sequence structure for `token_seq`
--

DROP SEQUENCE IF EXISTS `token_seq`;
CREATE SEQUENCE `token_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`token_seq`, 1001, 0);

--
-- Sequence structure for `tokengroup_seq`
--

DROP SEQUENCE IF EXISTS `tokengroup_seq`;
CREATE SEQUENCE `tokengroup_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`tokengroup_seq`, 1, 0);

--
-- Sequence structure for `tokeninfo_seq`
--

DROP SEQUENCE IF EXISTS `tokeninfo_seq`;
CREATE SEQUENCE `tokeninfo_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`tokeninfo_seq`, 1001, 0);

--
-- Sequence structure for `tokenowner_seq`
--

DROP SEQUENCE IF EXISTS `tokenowner_seq`;
CREATE SEQUENCE `tokenowner_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`tokenowner_seq`, 1001, 0);

--
-- Sequence structure for `tokenrealm_seq`
--

DROP SEQUENCE IF EXISTS `tokenrealm_seq`;
CREATE SEQUENCE `tokenrealm_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`tokenrealm_seq`, 1001, 0);

--
-- Sequence structure for `tokentokengroup_seq`
--

DROP SEQUENCE IF EXISTS `tokentokengroup_seq`;
CREATE SEQUENCE `tokentokengroup_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`tokentokengroup_seq`, 1, 0);

--
-- Sequence structure for `usercache_seq`
--

DROP SEQUENCE IF EXISTS `usercache_seq`;
CREATE SEQUENCE `usercache_seq` start with 1 minvalue 1 maxvalue 9223372036854775806 increment by 0 cache 1000 nocycle ENGINE=InnoDB;
SELECT SETVAL(`usercache_seq`, 1, 0);

--
-- Table structure for table `admin`
--

DROP TABLE IF EXISTS `admin`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin` (
  `username` varchar(120) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin`
--

LOCK TABLES `admin` WRITE;
/*!40000 ALTER TABLE `admin` DISABLE KEYS */;
INSERT INTO `admin` VALUES
('admin','$argon2id$v=19$m=65536,t=9,p=4$fc8ZI8S411qL0bqXUirFWA$j9/5vfS3pJvB5FsKNVs6o9WCd7jU3++FPIO6rfkqNHM',NULL);
/*!40000 ALTER TABLE `admin` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authcache`
--

DROP TABLE IF EXISTS `authcache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `authcache` (
  `id` int(11) NOT NULL,
  `first_auth` datetime(6) DEFAULT NULL,
  `last_auth` datetime(6) DEFAULT NULL,
  `username` varchar(64) DEFAULT NULL,
  `resolver` varchar(120) DEFAULT NULL,
  `realm` varchar(120) DEFAULT NULL,
  `client_ip` varchar(40) DEFAULT NULL,
  `user_agent` varchar(120) DEFAULT NULL,
  `auth_count` int(11) DEFAULT NULL,
  `authentication` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_authcache_username` (`username`),
  KEY `ix_authcache_realm` (`realm`),
  KEY `ix_authcache_last_auth` (`last_auth`),
  KEY `ix_authcache_resolver` (`resolver`),
  KEY `ix_authcache_first_auth` (`first_auth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authcache`
--

LOCK TABLES `authcache` WRITE;
/*!40000 ALTER TABLE `authcache` DISABLE KEYS */;
/*!40000 ALTER TABLE `authcache` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caconnector`
--

DROP TABLE IF EXISTS `caconnector`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `caconnector` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `catype` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caconnector`
--

LOCK TABLES `caconnector` WRITE;
/*!40000 ALTER TABLE `caconnector` DISABLE KEYS */;
/*!40000 ALTER TABLE `caconnector` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caconnectorconfig`
--

DROP TABLE IF EXISTS `caconnectorconfig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `caconnectorconfig` (
  `id` int(11) NOT NULL,
  `caconnector_id` int(11) DEFAULT NULL,
  `Key` varchar(255) NOT NULL,
  `Value` varchar(2000) DEFAULT NULL,
  `Type` varchar(2000) DEFAULT NULL,
  `Description` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ccix_2` (`caconnector_id`,`Key`),
  CONSTRAINT `caconnectorconfig_ibfk_1` FOREIGN KEY (`caconnector_id`) REFERENCES `caconnector` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caconnectorconfig`
--

LOCK TABLES `caconnectorconfig` WRITE;
/*!40000 ALTER TABLE `caconnectorconfig` DISABLE KEYS */;
/*!40000 ALTER TABLE `caconnectorconfig` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `challenge`
--

DROP TABLE IF EXISTS `challenge`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `challenge` (
  `id` int(11) NOT NULL,
  `transaction_id` varchar(64) NOT NULL,
  `data` varchar(512) DEFAULT NULL,
  `challenge` varchar(512) DEFAULT NULL,
  `session` varchar(512) DEFAULT NULL,
  `serial` varchar(40) DEFAULT NULL,
  `timestamp` datetime(6) DEFAULT NULL,
  `expiration` datetime(6) DEFAULT NULL,
  `received_count` int(11) DEFAULT NULL,
  `otp_valid` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_challenge_timestamp` (`timestamp`),
  KEY `ix_challenge_transaction_id` (`transaction_id`),
  KEY `ix_challenge_serial` (`serial`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `challenge`
--

LOCK TABLES `challenge` WRITE;
/*!40000 ALTER TABLE `challenge` DISABLE KEYS */;
/*!40000 ALTER TABLE `challenge` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clientapplication`
--

DROP TABLE IF EXISTS `clientapplication`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `clientapplication` (
  `id` int(11) NOT NULL,
  `ip` varchar(255) NOT NULL,
  `hostname` varchar(255) DEFAULT NULL,
  `clienttype` varchar(255) NOT NULL,
  `lastseen` datetime(6) DEFAULT NULL,
  `node` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `caix` (`ip`,`clienttype`,`node`),
  KEY `ix_clientapplication_lastseen` (`lastseen`),
  KEY `ix_clientapplication_ip` (`ip`),
  KEY `ix_clientapplication_clienttype` (`clienttype`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clientapplication`
--

LOCK TABLES `clientapplication` WRITE;
/*!40000 ALTER TABLE `clientapplication` DISABLE KEYS */;
/*!40000 ALTER TABLE `clientapplication` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `config`
--

DROP TABLE IF EXISTS `config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `config` (
  `Key` varchar(255) NOT NULL,
  `Value` varchar(2000) DEFAULT NULL,
  `Type` varchar(2000) DEFAULT NULL,
  `Description` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`Key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `config`
--

LOCK TABLES `config` WRITE;
/*!40000 ALTER TABLE `config` DISABLE KEYS */;
INSERT INTO `config` VALUES
('__timestamp__','1722001250','','config timestamp. last changed.');
/*!40000 ALTER TABLE `config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customuserattribute`
--

DROP TABLE IF EXISTS `customuserattribute`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customuserattribute` (
  `id` int(11) NOT NULL,
  `user_id` varchar(320) DEFAULT NULL,
  `resolver` varchar(120) DEFAULT NULL,
  `realm_id` int(11) DEFAULT NULL,
  `Key` varchar(255) NOT NULL,
  `Value` text DEFAULT NULL,
  `Type` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `realm_id` (`realm_id`),
  KEY `ix_customuserattribute_user_id` (`user_id`),
  KEY `ix_customuserattribute_resolver` (`resolver`),
  CONSTRAINT `customuserattribute_ibfk_1` FOREIGN KEY (`realm_id`) REFERENCES `realm` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customuserattribute`
--

LOCK TABLES `customuserattribute` WRITE;
/*!40000 ALTER TABLE `customuserattribute` DISABLE KEYS */;
/*!40000 ALTER TABLE `customuserattribute` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `eventcounter`
--

DROP TABLE IF EXISTS `eventcounter`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `eventcounter` (
  `id` int(11) NOT NULL,
  `counter_name` varchar(80) NOT NULL,
  `counter_value` int(11) DEFAULT NULL,
  `node` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `evctr_1` (`counter_name`,`node`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `eventcounter`
--

LOCK TABLES `eventcounter` WRITE;
/*!40000 ALTER TABLE `eventcounter` DISABLE KEYS */;
/*!40000 ALTER TABLE `eventcounter` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `eventhandler`
--

DROP TABLE IF EXISTS `eventhandler`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `eventhandler` (
  `id` int(11) NOT NULL,
  `name` varchar(64) DEFAULT NULL,
  `active` tinyint(1) DEFAULT NULL,
  `ordering` int(11) NOT NULL,
  `position` varchar(10) DEFAULT NULL,
  `event` varchar(255) NOT NULL,
  `handlermodule` varchar(255) NOT NULL,
  `condition` varchar(1024) DEFAULT NULL,
  `action` varchar(1024) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `eventhandler`
--

LOCK TABLES `eventhandler` WRITE;
/*!40000 ALTER TABLE `eventhandler` DISABLE KEYS */;
/*!40000 ALTER TABLE `eventhandler` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `eventhandlercondition`
--

DROP TABLE IF EXISTS `eventhandlercondition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `eventhandlercondition` (
  `id` int(11) NOT NULL,
  `eventhandler_id` int(11) DEFAULT NULL,
  `Key` varchar(255) NOT NULL,
  `Value` varchar(2000) DEFAULT NULL,
  `comparator` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ehcix_1` (`eventhandler_id`,`Key`),
  CONSTRAINT `eventhandlercondition_ibfk_1` FOREIGN KEY (`eventhandler_id`) REFERENCES `eventhandler` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `eventhandlercondition`
--

LOCK TABLES `eventhandlercondition` WRITE;
/*!40000 ALTER TABLE `eventhandlercondition` DISABLE KEYS */;
/*!40000 ALTER TABLE `eventhandlercondition` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `eventhandleroption`
--

DROP TABLE IF EXISTS `eventhandleroption`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `eventhandleroption` (
  `id` int(11) NOT NULL,
  `eventhandler_id` int(11) DEFAULT NULL,
  `Key` varchar(255) NOT NULL,
  `Value` varchar(2000) DEFAULT NULL,
  `Type` varchar(2000) DEFAULT NULL,
  `Description` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ehoix_1` (`eventhandler_id`,`Key`),
  CONSTRAINT `eventhandleroption_ibfk_1` FOREIGN KEY (`eventhandler_id`) REFERENCES `eventhandler` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `eventhandleroption`
--

LOCK TABLES `eventhandleroption` WRITE;
/*!40000 ALTER TABLE `eventhandleroption` DISABLE KEYS */;
/*!40000 ALTER TABLE `eventhandleroption` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `machineresolver`
--

DROP TABLE IF EXISTS `machineresolver`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `machineresolver` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `rtype` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `machineresolver`
--

LOCK TABLES `machineresolver` WRITE;
/*!40000 ALTER TABLE `machineresolver` DISABLE KEYS */;
/*!40000 ALTER TABLE `machineresolver` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `machineresolverconfig`
--

DROP TABLE IF EXISTS `machineresolverconfig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `machineresolverconfig` (
  `id` int(11) NOT NULL,
  `resolver_id` int(11) DEFAULT NULL,
  `Key` varchar(255) NOT NULL,
  `Value` varchar(2000) DEFAULT NULL,
  `Type` varchar(2000) DEFAULT NULL,
  `Description` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mrcix_2` (`resolver_id`,`Key`),
  CONSTRAINT `machineresolverconfig_ibfk_1` FOREIGN KEY (`resolver_id`) REFERENCES `machineresolver` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `machineresolverconfig`
--

LOCK TABLES `machineresolverconfig` WRITE;
/*!40000 ALTER TABLE `machineresolverconfig` DISABLE KEYS */;
/*!40000 ALTER TABLE `machineresolverconfig` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `machinetoken`
--

DROP TABLE IF EXISTS `machinetoken`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `machinetoken` (
  `id` int(11) NOT NULL,
  `token_id` int(11) DEFAULT NULL,
  `machineresolver_id` int(11) DEFAULT NULL,
  `machine_id` varchar(255) DEFAULT NULL,
  `application` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `token_id` (`token_id`),
  CONSTRAINT `machinetoken_ibfk_1` FOREIGN KEY (`token_id`) REFERENCES `token` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `machinetoken`
--

LOCK TABLES `machinetoken` WRITE;
/*!40000 ALTER TABLE `machinetoken` DISABLE KEYS */;
/*!40000 ALTER TABLE `machinetoken` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `machinetokenoptions`
--

DROP TABLE IF EXISTS `machinetokenoptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `machinetokenoptions` (
  `id` int(11) NOT NULL,
  `machinetoken_id` int(11) DEFAULT NULL,
  `mt_key` varchar(64) NOT NULL,
  `mt_value` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `machinetoken_id` (`machinetoken_id`),
  CONSTRAINT `machinetokenoptions_ibfk_1` FOREIGN KEY (`machinetoken_id`) REFERENCES `machinetoken` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `machinetokenoptions`
--

LOCK TABLES `machinetokenoptions` WRITE;
/*!40000 ALTER TABLE `machinetokenoptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `machinetokenoptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `monitoringstats`
--

DROP TABLE IF EXISTS `monitoringstats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `monitoringstats` (
  `id` int(11) NOT NULL,
  `timestamp` datetime(6) NOT NULL,
  `stats_key` varchar(128) NOT NULL,
  `stats_value` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `msix_1` (`timestamp`,`stats_key`),
  KEY `ix_monitoringstats_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `monitoringstats`
--

LOCK TABLES `monitoringstats` WRITE;
/*!40000 ALTER TABLE `monitoringstats` DISABLE KEYS */;
/*!40000 ALTER TABLE `monitoringstats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `passwordreset`
--

DROP TABLE IF EXISTS `passwordreset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `passwordreset` (
  `id` int(11) NOT NULL,
  `recoverycode` varchar(255) NOT NULL,
  `username` varchar(64) NOT NULL,
  `realm` varchar(64) NOT NULL,
  `resolver` varchar(64) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `timestamp` datetime(6) DEFAULT NULL,
  `expiration` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_passwordreset_realm` (`realm`),
  KEY `ix_passwordreset_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `passwordreset`
--

LOCK TABLES `passwordreset` WRITE;
/*!40000 ALTER TABLE `passwordreset` DISABLE KEYS */;
/*!40000 ALTER TABLE `passwordreset` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `periodictask`
--

DROP TABLE IF EXISTS `periodictask`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `periodictask` (
  `id` int(11) NOT NULL,
  `name` varchar(64) NOT NULL,
  `active` tinyint(1) NOT NULL,
  `retry_if_failed` tinyint(1) NOT NULL,
  `interval` varchar(256) NOT NULL,
  `nodes` varchar(256) NOT NULL,
  `taskmodule` varchar(256) NOT NULL,
  `ordering` int(11) NOT NULL,
  `last_update` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `periodictask`
--

LOCK TABLES `periodictask` WRITE;
/*!40000 ALTER TABLE `periodictask` DISABLE KEYS */;
/*!40000 ALTER TABLE `periodictask` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `periodictasklastrun`
--

DROP TABLE IF EXISTS `periodictasklastrun`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `periodictasklastrun` (
  `id` int(11) NOT NULL,
  `periodictask_id` int(11) DEFAULT NULL,
  `node` varchar(255) NOT NULL,
  `timestamp` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ptlrix_1` (`periodictask_id`,`node`),
  CONSTRAINT `periodictasklastrun_ibfk_1` FOREIGN KEY (`periodictask_id`) REFERENCES `periodictask` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `periodictasklastrun`
--

LOCK TABLES `periodictasklastrun` WRITE;
/*!40000 ALTER TABLE `periodictasklastrun` DISABLE KEYS */;
/*!40000 ALTER TABLE `periodictasklastrun` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `periodictaskoption`
--

DROP TABLE IF EXISTS `periodictaskoption`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `periodictaskoption` (
  `id` int(11) NOT NULL,
  `periodictask_id` int(11) DEFAULT NULL,
  `key` varchar(255) NOT NULL,
  `value` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ptoix_1` (`periodictask_id`,`key`),
  CONSTRAINT `periodictaskoption_ibfk_1` FOREIGN KEY (`periodictask_id`) REFERENCES `periodictask` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `periodictaskoption`
--

LOCK TABLES `periodictaskoption` WRITE;
/*!40000 ALTER TABLE `periodictaskoption` DISABLE KEYS */;
/*!40000 ALTER TABLE `periodictaskoption` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pidea_audit`
--

DROP TABLE IF EXISTS `pidea_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pidea_audit` (
  `id` int(11) NOT NULL,
  `date` datetime(6) DEFAULT NULL,
  `startdate` datetime(6) DEFAULT NULL,
  `duration` datetime(6) DEFAULT NULL,
  `signature` varchar(620) DEFAULT NULL,
  `action` varchar(50) DEFAULT NULL,
  `success` int(11) DEFAULT NULL,
  `serial` varchar(40) DEFAULT NULL,
  `token_type` varchar(12) DEFAULT NULL,
  `user` varchar(20) DEFAULT NULL,
  `realm` varchar(20) DEFAULT NULL,
  `resolver` varchar(50) DEFAULT NULL,
  `administrator` varchar(20) DEFAULT NULL,
  `action_detail` varchar(50) DEFAULT NULL,
  `info` varchar(50) DEFAULT NULL,
  `privacyidea_server` varchar(255) DEFAULT NULL,
  `client` varchar(50) DEFAULT NULL,
  `loglevel` varchar(12) DEFAULT NULL,
  `clearance_level` varchar(12) DEFAULT NULL,
  `thread_id` varchar(20) DEFAULT NULL,
  `policies` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_pidea_audit_user` (`user`),
  KEY `ix_pidea_audit_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;


--
-- Table structure for table `policy`
--

DROP TABLE IF EXISTS `policy`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `policy` (
  `id` int(11) NOT NULL,
  `active` tinyint(1) DEFAULT NULL,
  `check_all_resolvers` tinyint(1) DEFAULT NULL,
  `name` varchar(64) NOT NULL,
  `scope` varchar(32) NOT NULL,
  `action` varchar(2000) DEFAULT NULL,
  `realm` varchar(256) DEFAULT NULL,
  `adminrealm` varchar(256) DEFAULT NULL,
  `adminuser` varchar(256) DEFAULT NULL,
  `resolver` varchar(256) DEFAULT NULL,
  `pinode` varchar(256) DEFAULT NULL,
  `user` varchar(256) DEFAULT NULL,
  `client` varchar(256) DEFAULT NULL,
  `time` varchar(64) DEFAULT NULL,
  `priority` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `policy`
--

LOCK TABLES `policy` WRITE;
/*!40000 ALTER TABLE `policy` DISABLE KEYS */;
INSERT INTO `policy` VALUES
(1,1,0,'self-service','enrollment','verify_enrollment=totp hotp','','','','','','','','',1);
/*!40000 ALTER TABLE `policy` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `policycondition`
--

DROP TABLE IF EXISTS `policycondition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `policycondition` (
  `id` int(11) NOT NULL,
  `policy_id` int(11) NOT NULL,
  `section` varchar(255) NOT NULL,
  `Key` varchar(255) NOT NULL,
  `comparator` varchar(255) NOT NULL,
  `Value` varchar(2000) NOT NULL,
  `active` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `policy_id` (`policy_id`),
  CONSTRAINT `policycondition_ibfk_1` FOREIGN KEY (`policy_id`) REFERENCES `policy` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `policycondition`
--

LOCK TABLES `policycondition` WRITE;
/*!40000 ALTER TABLE `policycondition` DISABLE KEYS */;
INSERT INTO `policycondition` VALUES
(9,1,'HTTP Request header','SelfService','equals','true',1),
(10,1,'tokeninfo','tokenkind','equals','software',0);
/*!40000 ALTER TABLE `policycondition` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `privacyideaserver`
--

DROP TABLE IF EXISTS `privacyideaserver`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `privacyideaserver` (
  `id` int(11) NOT NULL,
  `identifier` varchar(255) NOT NULL,
  `url` varchar(255) NOT NULL,
  `tls` tinyint(1) DEFAULT NULL,
  `description` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `identifier` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `privacyideaserver`
--

LOCK TABLES `privacyideaserver` WRITE;
/*!40000 ALTER TABLE `privacyideaserver` DISABLE KEYS */;
/*!40000 ALTER TABLE `privacyideaserver` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `radiusserver`
--

DROP TABLE IF EXISTS `radiusserver`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `radiusserver` (
  `id` int(11) NOT NULL,
  `identifier` varchar(255) NOT NULL,
  `server` varchar(255) NOT NULL,
  `port` int(11) DEFAULT NULL,
  `secret` varchar(255) DEFAULT NULL,
  `dictionary` varchar(255) DEFAULT NULL,
  `description` varchar(2000) DEFAULT NULL,
  `timeout` int(11) DEFAULT NULL,
  `retries` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `identifier` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `radiusserver`
--

LOCK TABLES `radiusserver` WRITE;
/*!40000 ALTER TABLE `radiusserver` DISABLE KEYS */;
/*!40000 ALTER TABLE `radiusserver` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `realm`
--

DROP TABLE IF EXISTS `realm`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `realm` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `default` tinyint(1) DEFAULT NULL,
  `option` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `realm`
--

LOCK TABLES `realm` WRITE;
/*!40000 ALTER TABLE `realm` DISABLE KEYS */;
INSERT INTO `realm` VALUES
(1,'defrealm',1,'');
/*!40000 ALTER TABLE `realm` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `resolver`
--

DROP TABLE IF EXISTS `resolver`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resolver` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `rtype` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `resolver`
--

LOCK TABLES `resolver` WRITE;
/*!40000 ALTER TABLE `resolver` DISABLE KEYS */;
INSERT INTO `resolver` VALUES
(1,'deflocal','passwdresolver'),
(2,'mariadb_resolver','sqlresolver');
/*!40000 ALTER TABLE `resolver` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `resolverconfig`
--

DROP TABLE IF EXISTS `resolverconfig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resolverconfig` (
  `id` int(11) NOT NULL,
  `resolver_id` int(11) DEFAULT NULL,
  `Key` varchar(255) NOT NULL,
  `Value` varchar(2000) DEFAULT NULL,
  `Type` varchar(2000) DEFAULT NULL,
  `Description` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rcix_2` (`resolver_id`,`Key`),
  CONSTRAINT `resolverconfig_ibfk_1` FOREIGN KEY (`resolver_id`) REFERENCES `resolver` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `resolverconfig`
--

LOCK TABLES `resolverconfig` WRITE;
/*!40000 ALTER TABLE `resolverconfig` DISABLE KEYS */;
INSERT INTO `resolverconfig` VALUES
(1,1,'filename','/etc/passwd','',''),
(2,2,'Server','mariadb','string',''),
(3,2,'Driver','mysql+pymysql','string',''),
(4,2,'Port','3306','int',''),
(5,2,'Database','ducsxqm001','string',''),
(6,2,'User','admin','string',''),
(7,2,'Password','40a280204e5afec1cb26f96dd8e4a1ea:80e57e6205166ee894b6bf36822aaad0','password',''),
(8,2,'Editable','True','int',''),
(9,2,'Password_Hash_Type','SSHA256','string',''),
(10,2,'Table','users_service','string',''),
(11,2,'Limit','5000','int',''),
(12,2,'Map','{ \"userid\" : \"id\", \"username\": \"username\"}','string','');
/*!40000 ALTER TABLE `resolverconfig` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `resolverrealm`
--

DROP TABLE IF EXISTS `resolverrealm`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `resolverrealm` (
  `id` int(11) NOT NULL,
  `resolver_id` int(11) DEFAULT NULL,
  `realm_id` int(11) DEFAULT NULL,
  `priority` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rrix_2` (`resolver_id`,`realm_id`),
  KEY `realm_id` (`realm_id`),
  CONSTRAINT `resolverrealm_ibfk_1` FOREIGN KEY (`resolver_id`) REFERENCES `resolver` (`id`),
  CONSTRAINT `resolverrealm_ibfk_2` FOREIGN KEY (`realm_id`) REFERENCES `realm` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `resolverrealm`
--

LOCK TABLES `resolverrealm` WRITE;
/*!40000 ALTER TABLE `resolverrealm` DISABLE KEYS */;
INSERT INTO `resolverrealm` VALUES
(2,1,1,2),
(3,2,1,1);
/*!40000 ALTER TABLE `resolverrealm` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `serviceid`
--

DROP TABLE IF EXISTS `serviceid`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `serviceid` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `Description` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `serviceid`
--

LOCK TABLES `serviceid` WRITE;
/*!40000 ALTER TABLE `serviceid` DISABLE KEYS */;
/*!40000 ALTER TABLE `serviceid` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `smsgateway`
--

DROP TABLE IF EXISTS `smsgateway`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `smsgateway` (
  `id` int(11) NOT NULL,
  `identifier` varchar(255) NOT NULL,
  `description` varchar(1024) DEFAULT NULL,
  `providermodule` varchar(1024) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `identifier` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `smsgateway`
--

LOCK TABLES `smsgateway` WRITE;
/*!40000 ALTER TABLE `smsgateway` DISABLE KEYS */;
/*!40000 ALTER TABLE `smsgateway` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `smsgatewayoption`
--

DROP TABLE IF EXISTS `smsgatewayoption`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `smsgatewayoption` (
  `id` int(11) NOT NULL,
  `Key` varchar(255) NOT NULL,
  `Value` text DEFAULT NULL,
  `Type` varchar(100) DEFAULT NULL,
  `gateway_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sgix_1` (`gateway_id`,`Key`,`Type`),
  KEY `ix_smsgatewayoption_gateway_id` (`gateway_id`),
  CONSTRAINT `smsgatewayoption_ibfk_1` FOREIGN KEY (`gateway_id`) REFERENCES `smsgateway` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `smsgatewayoption`
--

LOCK TABLES `smsgatewayoption` WRITE;
/*!40000 ALTER TABLE `smsgatewayoption` DISABLE KEYS */;
/*!40000 ALTER TABLE `smsgatewayoption` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `smtpserver`
--

DROP TABLE IF EXISTS `smtpserver`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `smtpserver` (
  `id` int(11) NOT NULL,
  `identifier` varchar(255) NOT NULL,
  `server` varchar(255) NOT NULL,
  `port` int(11) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `sender` varchar(255) DEFAULT NULL,
  `tls` tinyint(1) DEFAULT NULL,
  `description` varchar(2000) DEFAULT NULL,
  `timeout` int(11) DEFAULT NULL,
  `enqueue_job` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `smtpserver`
--

LOCK TABLES `smtpserver` WRITE;
/*!40000 ALTER TABLE `smtpserver` DISABLE KEYS */;
/*!40000 ALTER TABLE `smtpserver` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subscription`
--

DROP TABLE IF EXISTS `subscription`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `subscription` (
  `id` int(11) NOT NULL,
  `application` varchar(80) DEFAULT NULL,
  `for_name` varchar(80) NOT NULL,
  `for_address` varchar(128) DEFAULT NULL,
  `for_email` varchar(128) NOT NULL,
  `for_phone` varchar(50) NOT NULL,
  `for_url` varchar(80) DEFAULT NULL,
  `for_comment` varchar(255) DEFAULT NULL,
  `by_name` varchar(50) NOT NULL,
  `by_email` varchar(128) NOT NULL,
  `by_address` varchar(128) DEFAULT NULL,
  `by_phone` varchar(50) DEFAULT NULL,
  `by_url` varchar(80) DEFAULT NULL,
  `date_from` datetime(6) DEFAULT NULL,
  `date_till` datetime(6) DEFAULT NULL,
  `num_users` int(11) DEFAULT NULL,
  `num_tokens` int(11) DEFAULT NULL,
  `num_clients` int(11) DEFAULT NULL,
  `level` varchar(80) DEFAULT NULL,
  `signature` varchar(640) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_subscription_application` (`application`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscription`
--

LOCK TABLES `subscription` WRITE;
/*!40000 ALTER TABLE `subscription` DISABLE KEYS */;
/*!40000 ALTER TABLE `subscription` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `token`
--

DROP TABLE IF EXISTS `token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `token` (
  `id` int(11) NOT NULL,
  `description` varchar(80) DEFAULT NULL,
  `serial` varchar(40) NOT NULL,
  `tokentype` varchar(30) DEFAULT NULL,
  `user_pin` varchar(512) DEFAULT NULL,
  `user_pin_iv` varchar(32) DEFAULT NULL,
  `so_pin` varchar(512) DEFAULT NULL,
  `so_pin_iv` varchar(32) DEFAULT NULL,
  `pin_seed` varchar(32) DEFAULT NULL,
  `otplen` int(11) DEFAULT NULL,
  `pin_hash` varchar(512) DEFAULT NULL,
  `key_enc` varchar(2800) DEFAULT NULL,
  `key_iv` varchar(32) DEFAULT NULL,
  `maxfail` int(11) DEFAULT NULL,
  `active` tinyint(1) NOT NULL,
  `revoked` tinyint(1) DEFAULT NULL,
  `locked` tinyint(1) DEFAULT NULL,
  `failcount` int(11) DEFAULT NULL,
  `count` int(11) DEFAULT NULL,
  `count_window` int(11) DEFAULT NULL,
  `sync_window` int(11) DEFAULT NULL,
  `rollout_state` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_token_serial` (`serial`),
  KEY `ix_token_tokentype` (`tokentype`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `token`
--

LOCK TABLES `token` WRITE;
/*!40000 ALTER TABLE `token` DISABLE KEYS */;
INSERT INTO `token` VALUES
(1,'Description of the token','TOTP0000D0CA','totp','','','','','',6,'','616d155aa45fd15aa58501057044258272134bbac3be6600c20a1b67579afc1c9411266b54e9f4317cd7c0162f1b6cb6','c043bcbd75d5b438988ec8becdfaa916',10,1,0,0,0,0,10,1000,''),
(2,'Description of the token','TOTP0001EFF5','totp','','','','','',6,'','fa47b29c16dbd6459bfadff5afea7d40bc612506c5173c2589558b461a22da0a390502e247bedad9a5dc928256dcd2dc','5f9a4a3d2c5dfa1c8ffb7190f089790a',10,1,0,0,0,0,10,1000,'');
/*!40000 ALTER TABLE `token` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tokengroup`
--

DROP TABLE IF EXISTS `tokengroup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tokengroup` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `Description` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tokengroup`
--

LOCK TABLES `tokengroup` WRITE;
/*!40000 ALTER TABLE `tokengroup` DISABLE KEYS */;
/*!40000 ALTER TABLE `tokengroup` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tokeninfo`
--

DROP TABLE IF EXISTS `tokeninfo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tokeninfo` (
  `id` int(11) NOT NULL,
  `Key` varchar(255) NOT NULL,
  `Value` text DEFAULT NULL,
  `Type` varchar(100) DEFAULT NULL,
  `Description` varchar(2000) DEFAULT NULL,
  `token_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tiix_2` (`token_id`,`Key`),
  KEY `ix_tokeninfo_token_id` (`token_id`),
  CONSTRAINT `tokeninfo_ibfk_1` FOREIGN KEY (`token_id`) REFERENCES `token` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tokeninfo`
--

LOCK TABLES `tokeninfo` WRITE;
/*!40000 ALTER TABLE `tokeninfo` DISABLE KEYS */;
INSERT INTO `tokeninfo` VALUES
(1,'tokenkind','software','','',1),
(2,'hashlib','sha1',NULL,NULL,1),
(3,'timeWindow','180','','',1),
(4,'timeShift','0.0','','',1),
(5,'timeStep','30','','',1),
(6,'tokenkind','hardware','','',2),
(7,'hashlib','sha1',NULL,NULL,2),
(8,'timeWindow','180','','',2),
(9,'timeShift','0.0','','',2),
(10,'timeStep','30','','',2);
/*!40000 ALTER TABLE `tokeninfo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tokenowner`
--

DROP TABLE IF EXISTS `tokenowner`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tokenowner` (
  `id` int(11) NOT NULL,
  `token_id` int(11) DEFAULT NULL,
  `resolver` varchar(120) DEFAULT NULL,
  `user_id` varchar(320) DEFAULT NULL,
  `realm_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `token_id` (`token_id`),
  KEY `realm_id` (`realm_id`),
  KEY `ix_tokenowner_resolver` (`resolver`),
  KEY `ix_tokenowner_user_id` (`user_id`),
  CONSTRAINT `tokenowner_ibfk_1` FOREIGN KEY (`token_id`) REFERENCES `token` (`id`),
  CONSTRAINT `tokenowner_ibfk_2` FOREIGN KEY (`realm_id`) REFERENCES `realm` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tokenowner`
--

LOCK TABLES `tokenowner` WRITE;
/*!40000 ALTER TABLE `tokenowner` DISABLE KEYS */;
/*!40000 ALTER TABLE `tokenowner` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tokenrealm`
--

DROP TABLE IF EXISTS `tokenrealm`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tokenrealm` (
  `id` int(11) NOT NULL,
  `token_id` int(11) DEFAULT NULL,
  `realm_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trix_2` (`token_id`,`realm_id`),
  KEY `realm_id` (`realm_id`),
  CONSTRAINT `tokenrealm_ibfk_1` FOREIGN KEY (`token_id`) REFERENCES `token` (`id`),
  CONSTRAINT `tokenrealm_ibfk_2` FOREIGN KEY (`realm_id`) REFERENCES `realm` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tokenrealm`
--

LOCK TABLES `tokenrealm` WRITE;
/*!40000 ALTER TABLE `tokenrealm` DISABLE KEYS */;
INSERT INTO `tokenrealm` VALUES
(2,1,1),
(4,2,1);
/*!40000 ALTER TABLE `tokenrealm` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tokentokengroup`
--

DROP TABLE IF EXISTS `tokentokengroup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tokentokengroup` (
  `id` int(11) NOT NULL,
  `token_id` int(11) DEFAULT NULL,
  `tokengroup_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ttgix_2` (`token_id`,`tokengroup_id`),
  KEY `tokengroup_id` (`tokengroup_id`),
  CONSTRAINT `tokentokengroup_ibfk_1` FOREIGN KEY (`token_id`) REFERENCES `token` (`id`),
  CONSTRAINT `tokentokengroup_ibfk_2` FOREIGN KEY (`tokengroup_id`) REFERENCES `tokengroup` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tokentokengroup`
--

LOCK TABLES `tokentokengroup` WRITE;
/*!40000 ALTER TABLE `tokentokengroup` DISABLE KEYS */;
/*!40000 ALTER TABLE `tokentokengroup` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usercache`
--

DROP TABLE IF EXISTS `usercache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `usercache` (
  `id` int(11) NOT NULL,
  `username` varchar(64) DEFAULT NULL,
  `used_login` varchar(64) DEFAULT NULL,
  `resolver` varchar(120) DEFAULT NULL,
  `user_id` varchar(320) DEFAULT NULL,
  `timestamp` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_usercache_used_login` (`used_login`),
  KEY `ix_usercache_username` (`username`),
  KEY `ix_usercache_timestamp` (`timestamp`),
  KEY `ix_usercache_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usercache`
--

LOCK TABLES `usercache` WRITE;
/*!40000 ALTER TABLE `usercache` DISABLE KEYS */;
/*!40000 ALTER TABLE `usercache` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users_service`
--

DROP TABLE IF EXISTS `users_service`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users_service` (
  `userid` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  PRIMARY KEY (`userid`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users_service`
--

LOCK TABLES `users_service` WRITE;
/*!40000 ALTER TABLE `users_service` DISABLE KEYS */;
INSERT INTO `users_service` VALUES
(1,'autotester'),
(2,'faltmann'),
(3,'test');
/*!40000 ALTER TABLE `users_service` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2024-07-26 13:52:09

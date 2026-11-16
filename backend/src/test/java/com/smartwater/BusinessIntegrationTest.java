package com.smartwater;

import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.junit.jupiter.api.Assertions.*;
import static com.smartwater.Store.*;

/** Real HTTP, Spring Security, Flyway and an isolated PostgreSQL schema. No application DB deletion. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class BusinessIntegrationTest {
 static final String SCHEMA="it_"+UUID.randomUUID().toString().replace("-","");
 static final String TEST_PASSWORD="test-only-"+UUID.randomUUID();
 static final String TOKEN="test-collector-"+UUID.randomUUID();
 static final String BASIN="SW_BIO_AERATION_001";
 @DynamicPropertySource static void properties(DynamicPropertyRegistry r){
  r.add("spring.datasource.url",()->"jdbc:postgresql://127.0.0.1:55439/smartwater_test?currentSchema="+SCHEMA);
  r.add("spring.flyway.schemas",()->SCHEMA);r.add("spring.flyway.default-schema",()->SCHEMA);r.add("spring.flyway.create-schemas",()->true);
  r.add("SW_ADMIN_PASSWORD",()->TEST_PASSWORD);r.add("SW_OPERATOR_PASSWORD",()->TEST_PASSWORD);r.add("SW_VIEWER_PASSWORD",()->TEST_PASSWORD);r.add("SW_COLLECTOR_TOKEN",()->TOKEN);
 }
 @Autowired Store db;@Autowired Environment env;
 HttpClient client;String csrf;int status;Map<String,Object> response;static String alarm,snapshot;static Instant base=Instant.now().minusSeconds(70).truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
 @BeforeEach void start(){assertEquals("smartwater_test",db.jdbc.queryForObject("select current_database()",String.class));assertEquals(SCHEMA,db.jdbc.queryForObject("select current_schema()",String.class));client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();}
 Object request(String method,String path,Object body,Map<String,String> headers)throws Exception{
  var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+env.getProperty("local.server.port")+"/api/business"+path)).timeout(Duration.ofSeconds(20));
  String payload=body==null?"":body instanceof String s?s:db.encode(body);builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(payload));
  if(body!=null)builder.header("Content-Type",body instanceof String?"application/x-www-form-urlencoded":"application/json");headers.forEach(builder::header);
  var result=client.send(builder.build(),HttpResponse.BodyHandlers.ofString());status=result.statusCode();Object parsed=db.json.readValue(result.body(),Object.class);response=parsed instanceof Map<?,?>?(Map<String,Object>)parsed:null;return parsed;
 }
 void login(String user)throws Exception{request("GET","/auth/csrf",null,Map.of());csrf=response.get("token").toString();request("POST","/auth/login","username="+user+"&password="+URLEncoder.encode(TEST_PASSWORD,java.nio.charset.StandardCharsets.UTF_8),Map.of("X-XSRF-TOKEN",csrf));assertEquals(200,status);request("GET","/auth/csrf",null,Map.of());csrf=response.get("token").toString();}
 Map<String,Object> reading(String metric,Object value,String unit,String quality,Instant time){return map("sampleId",UUID.randomUUID().toString(),"deviceId",BASIN,"metricKey",metric,"value",value,"unit",unit,"quality",quality,"source","SIMULATED","observedAt",time.toString());}
 Object ingest(List<Map<String,Object>> readings,String key)throws Exception{return request("POST","/telemetry",map("scenario","LOW_DO","readings",readings),Map.of("Authorization","Bearer "+TOKEN,"Idempotency-Key",key));}
 String code(){return ((Map<?,?>)response.get("error")).get("code").toString();}
 @Test @Order(1) void authenticationAndLedger()throws Exception{
  request("GET","/devices",null,Map.of());assertEquals(401,status);
  login("viewer");var devices=(List<?>)request("GET","/devices",null,Map.of());assertEquals(200,status);assertEquals(4,devices.size());
  request("POST","/telemetry",map("scenario","NORMAL","readings",List.of(reading("do",2.8,"mg/L","GOOD",base))),Map.of("Idempotency-Key","bad-token"));assertEquals(401,status);
 }
 @Test @Order(2) void transactionalValidation()throws Exception{
  long before=db.jdbc.queryForObject("select count(*) from telemetry",Long.class);
  ingest(List.of(reading("do",2.8,"mg/L","GOOD",base),reading("ph",7.2,"kW","GOOD",base)),"invalid-unit");assertEquals(400,status);assertEquals("UNIT_MISMATCH",code());assertEquals(before,db.jdbc.queryForObject("select count(*) from telemetry",Long.class));
  ingest(List.of(reading("do",0,"mg/L","MISSING",base)),"invalid-missing");assertEquals(400,status);assertEquals("INVALID_QUALITY_VALUE",code());
  ingest(List.of(reading("do",2.8,"mg/L","GOOD",Instant.now().plusSeconds(300))),"invalid-time");assertEquals(400,status);
  ingest(List.of(reading("blower_power",80,"kW","GOOD",base)),"wrong-owner");assertEquals(400,status);assertEquals("METRIC_NOT_OWNED",code());
 }
 @Test @Order(3) void ingestionIdempotencyAndDeduplicatedAlarm()throws Exception{
  var points=List.of(reading("do",1.6,"mg/L","GOOD",base),reading("do",1.7,"mg/L","GOOD",base.plusSeconds(1)));
  Object first=ingest(points,"two-low");assertEquals(200,status);assertEquals(2,((Number)response.get("inserted")).intValue());
  assertEquals(first,ingest(points,"two-low"));assertEquals(200,status);
  ingest(List.of(reading("do",1.9,"mg/L","GOOD",base.plusSeconds(2))),"two-low");assertEquals(409,status);assertEquals("IDEMPOTENCY_CONFLICT",code());
  assertEquals(1L,db.jdbc.queryForObject("select count(*) from alarm",Long.class));alarm=db.jdbc.queryForObject("select id::text from alarm",String.class);assertEquals(2,db.jdbc.queryForObject("select occurrence_count from alarm",Integer.class));
  login("viewer");request("GET","/dashboard",null,Map.of());assertEquals(200,status);snapshot=response.get("snapshotId").toString();assertEquals(1,((List<?>)response.get("alarms")).size());
 }
 @Test @Order(4) void missingDoesNotRecoverAndOutOfOrderDoesNotRewind()throws Exception{
  ingest(List.of(reading("do",null,"mg/L","MISSING",base.plusSeconds(3))),"missing");assertEquals(200,status);
  assertEquals("ACTIVE",db.jdbc.queryForObject("select state from alarm",String.class));assertEquals("MISSING",db.jdbc.queryForObject("select quality from alarm",String.class));
  ingest(List.of(reading("do",3.0,"mg/L","GOOD",base.minusSeconds(30))),"late");assertEquals(200,status);assertEquals("ACTIVE",db.jdbc.queryForObject("select state from alarm",String.class));
  login("viewer");request("GET","/snapshots/"+snapshot,null,Map.of());var old=(Map<?,?>)((Map<?,?>)response.get("readings")).get("do");assertEquals(1.7,((Number)old.get("value")).doubleValue());assertEquals("ACTIVE",((Map<?,?>)((List<?>)response.get("alarms")).get(0)).get("status"));
  request("GET","/dashboard",null,Map.of());var current=(Map<?,?>)((Map<?,?>)response.get("readings")).get("do");assertNull(current.get("value"));assertEquals("MISSING",current.get("quality"));assertEquals("AWAITING_DATA",((Map<?,?>)((List<?>)response.get("alarms")).get(0)).get("status"));
 }
 @Test @Order(5) void permissionsAndCsrf()throws Exception{
  login("viewer");request("POST","/alarms/"+alarm+"/acknowledge",map("note","确认"),Map.of("X-XSRF-TOKEN",csrf,"Idempotency-Key","denied"));assertEquals(403,status);
  request("GET","/audit",null,Map.of());assertEquals(403,status);
  login("operator");request("POST","/alarms/"+alarm+"/acknowledge",map("note","确认"),Map.of("Idempotency-Key","no-csrf"));assertEquals(403,status);
 }
 @Test @Order(6) void acknowledgeRecoveryCloseAndAudit()throws Exception{
  login("operator");var headers=Map.of("X-XSRF-TOKEN",csrf,"Idempotency-Key","ack-once");Object ack=request("POST","/alarms/"+alarm+"/acknowledge",map("note","已核对演示证据"),headers);assertEquals(200,status);assertNotNull(response.get("acknowledgedAt"));assertEquals(ack,request("POST","/alarms/"+alarm+"/acknowledge",map("note","已核对演示证据"),headers));
  request("POST","/alarms/"+alarm+"/close",map("note","提前关闭"),Map.of("X-XSRF-TOKEN",csrf,"Idempotency-Key","close-too-early"));assertEquals(409,status);
  ingest(List.of(reading("do",2.8,"mg/L","GOOD",base.plusSeconds(4))),"recover");assertEquals(200,status);
  var closeHeaders=Map.of("X-XSRF-TOKEN",csrf,"Idempotency-Key","close-once");Object closed=request("POST","/alarms/"+alarm+"/close",map("note","已恢复且人工确认"),closeHeaders);assertEquals(200,status);assertEquals("CLOSED",response.get("status"));assertEquals(closed,request("POST","/alarms/"+alarm+"/close",map("note","已恢复且人工确认"),closeHeaders));
  assertEquals(1L,db.jdbc.queryForObject("select count(*) from alarm",Long.class));assertEquals(2L,db.jdbc.queryForObject("select count(*) from command_receipt",Long.class));
  login("admin");var events=(List<?>)request("GET","/audit",null,Map.of());assertEquals(200,status);assertTrue(events.size()>=5);
 }
 @Test @Order(7) void serverStatisticsOwnershipAndMissingEquipment()throws Exception{
  login("viewer");request("GET","/snapshots/"+snapshot+"/devices/"+BASIN+"/metrics?metricKeys=do&hours=6",null,Map.of());assertEquals(200,status);var data=(Map<?,?>)response.get("data");var metric=(Map<?,?>)((List<?>)data.get("metrics")).get(0);var history=(Map<?,?>)metric.get("history");assertEquals(6,((Number)history.get("hours")).intValue());assertEquals(361,((Number)history.get("expected_samples")).intValue());assertNotNull(response.get("evidence_id"));Object frozen=response;String evidenceId=response.get("evidence_id").toString();request("GET","/evidence/"+evidenceId,null,Map.of());assertEquals(200,status);assertEquals(frozen,response);
  request("GET","/snapshots/"+snapshot+"/devices/"+BASIN+"/metrics?metricKeys=blower_power",null,Map.of());assertEquals(400,status);
  request("GET","/snapshots/"+snapshot+"/devices/SW_PRE_PUMP_001/metrics",null,Map.of());assertEquals(200,status);assertEquals("NO_DEFINED_METRICS",((Map<?,?>)response.get("data")).get("outcome"));
  request("GET","/snapshots/"+snapshot+"/alarms/"+alarm,null,Map.of());assertEquals(200,status);var evidence=(Map<?,?>)response.get("data");assertEquals("GOOD",evidence.get("event_quality"));assertEquals("demo-do-v1",evidence.get("rule_version"));
 }
 @Test @Order(8) void concurrentReplayIsOneTransactionAndExtraFieldsRejected()throws Exception{
  var payload=map("scenario","NORMAL","readings",List.of(reading("do",2.7,"mg/L","GOOD",base.plusSeconds(5))));
  var url=URI.create("http://127.0.0.1:"+env.getProperty("local.server.port")+"/api/business/telemetry");
  var req=HttpRequest.newBuilder(url).header("Content-Type","application/json").header("Authorization","Bearer "+TOKEN).header("Idempotency-Key","concurrent").POST(HttpRequest.BodyPublishers.ofString(db.encode(payload))).build();
  var a=client.sendAsync(req,HttpResponse.BodyHandlers.ofString());var b=client.sendAsync(req,HttpResponse.BodyHandlers.ofString());
  assertEquals(200,a.get().statusCode());assertEquals(200,b.get().statusCode());assertEquals(db.decode(a.get().body()),db.decode(b.get().body()));
  assertEquals(1L,db.jdbc.queryForObject("select count(*) from ingestion where idempotency_key='concurrent'",Long.class));
  payload.put("unexpected",true);request("POST","/telemetry",payload,Map.of("Authorization","Bearer "+TOKEN,"Idempotency-Key","extra"));assertEquals(400,status);
 }

 @Test @Order(9) void pinnedCatalogAndRulesDoNotChangeWithCurrentConfiguration()throws Exception{
  login("viewer");Object before=request("GET","/snapshots/"+snapshot,null,Map.of());
  db.jdbc.update("update device set name='new test label' where id=?",BASIN);db.jdbc.update("update alarm_rule set threshold=1.5 where id='DEMO_DO_LOW'");
  Object old=request("GET","/snapshots/"+snapshot,null,Map.of());assertEquals(before,old);
  request("GET","/snapshots/"+snapshot+"/devices/"+BASIN+"/details",null,Map.of());assertEquals("一号曝气池",((Map<?,?>)response.get("data")).get("name"));
  request("GET","/dashboard",null,Map.of());var backend=(Map<?,?>)response.get("backend");var rules=(Map<?,?>)((Map<?,?>)backend.get("rules")).get("lowDo");assertEquals(1.5,((Number)rules.get("below")).doubleValue());
 }

}

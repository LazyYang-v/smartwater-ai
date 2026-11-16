package com.smartwater;
import java.security.Principal;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.web.csrf.CsrfToken;
import static com.smartwater.Store.*;
@RestController @RequestMapping("/api/business")
public class ApiController {
 final Store db;final BusinessQueries queries;final TelemetryService telemetry;final AlarmService alarms;
 public ApiController(Store db,BusinessQueries queries,TelemetryService telemetry,AlarmService alarms){this.db=db;this.queries=queries;this.telemetry=telemetry;this.alarms=alarms;}
 @GetMapping("/health") Map<String,Object> health(){db.jdbc.queryForObject("SELECT 1",Integer.class);return map("status","UP","version","0.2.0","database","PostgreSQL","source","SIMULATED");}
 @GetMapping("/auth/csrf") Map<String,Object> csrf(CsrfToken token){return map("token",token.getToken(),"headerName",token.getHeaderName());}
 @GetMapping("/auth/me") Map<String,Object> me(Principal principal){var u=db.one("SELECT username,role FROM app_user WHERE username=?",principal.getName());return map("username",u.get("username"),"roles",List.of("ROLE_"+u.get("role")));}
 @GetMapping("/evidence/{id}") Object evidence(@PathVariable String id){return db.decode(db.one("SELECT result FROM query_evidence WHERE id=?",id).get("result"));}
 @GetMapping("/devices") Object devices(){return queries.devices();}
 @GetMapping("/dashboard") Object dashboard(Principal principal){return queries.dashboard(principal.getName());}
 @GetMapping("/snapshots/{id}") Object snapshot(@PathVariable String id){return queries.snapshot(id);}
 @GetMapping("/snapshots/{id}/devices/{device}/details") Object details(@PathVariable String id,@PathVariable String device){return queries.envelope(id,"device.get_details",device,queries.details(id,device));}
 @GetMapping("/snapshots/{id}/devices/{device}/metrics") Object metrics(@PathVariable String id,@PathVariable String device,@RequestParam(required=false) List<String> metricKeys,@RequestParam(required=false) Integer hours){return queries.envelope(id,"device.get_metrics",device,queries.metrics(id,device,metricKeys,hours));}
 @GetMapping("/snapshots/{id}/alarms") Object alarms(@PathVariable String id,@RequestParam(required=false) String deviceId){if(deviceId!=null)db.one("SELECT id FROM device WHERE id=?",deviceId);return queries.envelope(id,"alarm.list",deviceId,map("alarms",queries.alarms(id,deviceId,true),"scope",deviceId==null?queries.devices().stream().map(d->d.get("id")).toList():List.of(deviceId),"limitation","无告警不等于设备正常；未配置指标不等于零"));}
 @GetMapping("/snapshots/{id}/alarms/{alarm}") Object inspect(@PathVariable String id,@PathVariable String alarm){var data=queries.inspect(id,alarm);return queries.envelope(id,"alarm.inspect",((Map<?,?>)data.get("alarm")).get("deviceId").toString(),data);}
 @PostMapping("/telemetry") @PreAuthorize("hasRole('COLLECTOR')") Object ingest(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody TelemetryService.Batch body,Principal principal){return telemetry.ingest(body,key,principal.getName());}
 @GetMapping("/alarms") Object alarmRecords(){return db.rows("SELECT * FROM alarm ORDER BY occurred_at DESC LIMIT 100").stream().map(db::alarm).toList();}
 public record Note(@NotBlank @Size(max=500) String note){}
 @PostMapping("/alarms/{id}/acknowledge") @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')") Object ack(@PathVariable String id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody Note note,Principal principal){return alarms.command(id,"acknowledge",note.note(),key,principal.getName());}
 @PostMapping("/alarms/{id}/close") @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')") Object close(@PathVariable String id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody Note note,Principal principal){return alarms.command(id,"close",note.note(),key,principal.getName());}
 @GetMapping("/audit") @PreAuthorize("hasRole('ADMIN')") Object audit(){return db.rows("SELECT id,actor,action,entity_id,occurred_at FROM audit_event ORDER BY occurred_at DESC LIMIT 100");}
}

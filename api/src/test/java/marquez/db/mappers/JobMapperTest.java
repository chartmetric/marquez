/*
 * Copyright 2018-2023 contributors to the Marquez project
 * SPDX-License-Identifier: Apache-2.0
 */

package marquez.db.mappers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.core.type.TypeReference;
import java.net.MalformedURLException;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.TimeZone;
import java.util.UUID;
import marquez.common.Utils;
import marquez.common.models.JobType;
import marquez.common.models.RunState;
import marquez.db.Columns;
import marquez.service.models.Job;
import org.jdbi.v3.core.statement.StatementContext;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.util.PGobject;

class JobMapperTest {

  private static ResultSet resultSet;
  private static TimeZone defaultTZ = TimeZone.getDefault();

  private static String JOB_FACET =
      """
      [{"jobType": {"jobType": "QUERY", "integration": "FLINK", "processingType": "STREAMING"}}]
      """;

  @BeforeAll
  public static void setUp() throws SQLException, MalformedURLException {
    TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    resultSet = mock(ResultSet.class);
    when(resultSet.getMetaData()).thenReturn(mock(ResultSetMetaData.class));
    when(resultSet.getString(Columns.NAMESPACE_NAME)).thenReturn("NAMESPACE");
    when(resultSet.getObject(Columns.NAMESPACE_NAME)).thenReturn("NAMESPACE");
    when(resultSet.getString(Columns.NAME)).thenReturn("NAME");
    when(resultSet.getObject(Columns.NAME)).thenReturn("NAME");
    when(resultSet.getString(Columns.SIMPLE_NAME)).thenReturn("SIMPLE_NAME");
    when(resultSet.getObject(Columns.SIMPLE_NAME)).thenReturn("SIMPLE_NAME");
    when(resultSet.getString(Columns.TYPE)).thenReturn("BATCH");
    when(resultSet.getObject(Columns.TYPE)).thenReturn("BATCH");
    when(resultSet.getString(Columns.DESCRIPTION)).thenReturn("DESCRIPTION");
    when(resultSet.getObject(Columns.DESCRIPTION)).thenReturn("DESCRIPTION");
    when(resultSet.getTimestamp(Columns.CREATED_AT))
        .thenReturn(Timestamp.valueOf("2000-01-01 00:00:01"));
    when(resultSet.getObject(Columns.CREATED_AT))
        .thenReturn(Timestamp.valueOf("2000-01-01 00:00:01"));
    when(resultSet.getTimestamp(Columns.UPDATED_AT))
        .thenReturn(Timestamp.valueOf("2000-01-02 00:00:01"));
    when(resultSet.getObject(Columns.UPDATED_AT))
        .thenReturn(Timestamp.valueOf("2000-01-02 00:00:01"));
    when(resultSet.getObject(Columns.CURRENT_VERSION_UUID))
        .thenReturn(UUID.fromString("b1d626a2-6d3a-475e-9ecf-943176d4a8c6"));
    when(resultSet.getObject(Columns.CURRENT_VERSION_UUID, UUID.class))
        .thenReturn(UUID.fromString("b1d626a2-6d3a-475e-9ecf-943176d4a8c6"));
    when(resultSet.getString("current_location")).thenReturn("https://github.com/");
    when(resultSet.getObject("current_location")).thenReturn("https://github.com/");
    when(resultSet.getString(Columns.FACETS)).thenReturn(null);
    when(resultSet.getObject(Columns.FACETS)).thenReturn(null);
    PGobject inputs = new PGobject();
    inputs.setValue(
        "[{\n"
            + "    \"namespace\": \"test-namespace\",\n"
            + "    \"name\": \"test-dataset\"\n"
            + "  }]");
    when(resultSet.getObject("current_inputs")).thenReturn(inputs);
  }

  @AfterAll
  public static void reset() {
    TimeZone.setDefault(defaultTZ);
  }

  @Test
  void shouldMapFullJob() throws SQLException {
    JobMapper underTest = new JobMapper();
    Job expected =
        Utils.fromJson(
            this.getClass().getResourceAsStream("/mappers/full_job_mapper.json"),
            new TypeReference<Job>() {});

    Job actual = underTest.map(resultSet, mock(StatementContext.class));
    assertThat(actual).isEqualTo(expected);
  }

  @Test
  void testMapJobTypeJobFacet() throws SQLException {
    ResultSetMetaData resultSetMetaData = mock(ResultSetMetaData.class);

    when(resultSet.getString(Columns.TYPE)).thenReturn("STREAM");
    when(resultSet.getObject(Columns.TYPE)).thenReturn("STREAM");

    when(resultSet.getMetaData()).thenReturn(resultSetMetaData);
    when(resultSetMetaData.getColumnCount()).thenReturn(1);
    when(resultSetMetaData.getColumnName(1)).thenReturn(Columns.FACETS);

    when(resultSet.getString(Columns.FACETS)).thenReturn(JOB_FACET);
    when(resultSet.getObject(Columns.FACETS)).thenReturn(JOB_FACET);
    JobMapper underTest = new JobMapper();

    Job actual = underTest.map(resultSet, mock(StatementContext.class));

    assertThat(actual.getType()).isEqualTo(JobType.STREAM);
    assertThat(actual.getLabels()).containsExactly("QUERY", "FLINK");
  }

  @Test
  void shouldMapLatestRunSummary() throws SQLException {
    ResultSetMetaData metadata = mock(ResultSetMetaData.class);
    String[] columns = {
      "latest_run_uuid",
      "latest_run_created_at",
      "latest_run_updated_at",
      "latest_run_nominal_start_time",
      "latest_run_nominal_end_time",
      "latest_run_current_run_state",
      "latest_run_started_at",
      "latest_run_ended_at",
      "latest_run_namespace_name",
      "latest_run_job_name",
      "latest_run_job_version",
      "latest_run_location"
    };
    when(metadata.getColumnCount()).thenReturn(columns.length);
    for (int index = 0; index < columns.length; index++) {
      when(metadata.getColumnName(index + 1)).thenReturn(columns[index]);
    }
    when(resultSet.getMetaData()).thenReturn(metadata);

    UUID runUuid = UUID.fromString("748eb75a-6c2f-4f8d-8946-00910da5458e");
    when(resultSet.getObject("latest_run_uuid")).thenReturn(runUuid);
    when(resultSet.getObject("latest_run_uuid", UUID.class)).thenReturn(runUuid);
    when(resultSet.getObject("latest_run_created_at"))
        .thenReturn(Timestamp.valueOf("2000-01-03 00:00:00"));
    when(resultSet.getTimestamp("latest_run_created_at"))
        .thenReturn(Timestamp.valueOf("2000-01-03 00:00:00"));
    when(resultSet.getObject("latest_run_updated_at"))
        .thenReturn(Timestamp.valueOf("2000-01-03 00:01:00"));
    when(resultSet.getTimestamp("latest_run_updated_at"))
        .thenReturn(Timestamp.valueOf("2000-01-03 00:01:00"));
    when(resultSet.getObject("latest_run_current_run_state")).thenReturn("COMPLETED");
    when(resultSet.getString("latest_run_current_run_state")).thenReturn("COMPLETED");
    when(resultSet.getObject("latest_run_started_at"))
        .thenReturn(Timestamp.valueOf("2000-01-03 00:00:00"));
    when(resultSet.getTimestamp("latest_run_started_at"))
        .thenReturn(Timestamp.valueOf("2000-01-03 00:00:00"));
    when(resultSet.getObject("latest_run_ended_at"))
        .thenReturn(Timestamp.valueOf("2000-01-03 00:01:00"));
    when(resultSet.getTimestamp("latest_run_ended_at"))
        .thenReturn(Timestamp.valueOf("2000-01-03 00:01:00"));
    when(resultSet.getObject("latest_run_namespace_name")).thenReturn("NAMESPACE");
    when(resultSet.getString("latest_run_namespace_name")).thenReturn("NAMESPACE");
    when(resultSet.getObject("latest_run_job_name")).thenReturn("NAME");
    when(resultSet.getString("latest_run_job_name")).thenReturn("NAME");

    Job actual = new JobMapper().map(resultSet, mock(StatementContext.class));

    assertThat(actual.getLatestRun()).isPresent();
    assertThat(actual.getLatestRun().orElseThrow().getId().getValue()).isEqualTo(runUuid);
    assertThat(actual.getLatestRun().orElseThrow().getState()).isEqualTo(RunState.COMPLETED);
    assertThat(actual.getLatestRun().orElseThrow().getDurationMs()).contains(60_000L);
  }
}

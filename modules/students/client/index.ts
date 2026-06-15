import React from 'react';
import { ModuleClientDefinition } from '@sinapsis/module-sdk-client';
import StudentModule from './StudentModule';
import { STUDENT_TRANSLATIONS } from './translations';

const moduleDefinition: ModuleClientDefinition = {
  code: 'STUDENTS',
  mainNav: {
    id: 'students',
    icon: 'fa-user-graduate'
  },
  views: {
    Students: ({ setView, currentUser, companyId, onSubTitleChange }) =>
      React.createElement(StudentModule, { view: 'list', setView, currentUser, companyId, onSubTitleChange }),
    StudentDetails: ({ setView, currentUser, companyId, onSubTitleChange }) =>
      React.createElement(StudentModule, { view: 'details', setView, currentUser, companyId, onSubTitleChange })
  },
  sidebarSections: [
    {
      label: 'students.title',
      items: [{ name: 'students.list', view: 'Students', icon: 'fa-user-graduate' }]
    }
  ],
  breadcrumbs: {
    Students: { main: 'students.title', sub: 'students.list' },
    StudentDetails: { main: 'students.title', sub: 'students.details', listTarget: 'Students' }
  },
  translations: STUDENT_TRANSLATIONS
};

export default moduleDefinition;

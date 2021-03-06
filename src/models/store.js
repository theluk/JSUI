import { types, flow, getRoot } from 'mobx-state-tree';

//swal
import Swal from 'sweetalert2';
import { confirmDelete, prompt } from 'config/swal';

//utils
import groupBy from 'lodash/groupBy';
import compact from 'lodash/compact';

//models
import Group from './Group';
import Project from './Project';
import Process from './Process';
import File from './File';
import Actions from './actions';

//stores
import SettingsView from 'models/views/settings-view';
import HomeView from 'models/views/home-view';

import { RouterStore } from 'rttr';

//electron
import ipcc from 'ipcc/renderer';
import Processes from 'models/Processes';
import Boolean from 'models/Boolean';
import { createModel, whatever } from 'utils/mst-utils';

//native
const fkill = window.require('electron').remote.require('fkill');
const fs = window.require('fs');

export default types
  .model('Store', {
    firstLoad: true,
    groups: types.optional(types.array(Group), []),
    projects: types.optional(types.array(Project), []),
    router: types.optional(RouterStore, {}),
    openedFile: types.maybe(File),
    settings: types.optional(SettingsView, {}),
    home: types.optional(HomeView, {}),
    processes: types.optional(Processes, Processes.create()),
    addingProjectToGroup: types.maybe(types.reference(Project)),
    activeGenerator: whatever(null),
    //booleans
    settingsOpened: createModel(Boolean),
    searchOpened: createModel(Boolean),
    actionsOpened: createModel(Boolean),
    cssConverterDialogOpen: createModel(Boolean),
    babelReplDialogOpen: createModel(Boolean),
    actions: createModel(Actions),
    generateDialogOpen: createModel(Boolean)
  })
  .actions(self => {
    return {
      killProcess: async () => {
        const { value: port } = await prompt('Kill port', 'Port');
        if (port) {
          fkill(`:${port}`)
            .then(() =>
              Swal({
                title: `Port ${port} was successfully killed.`,
                type: 'success'
              })
            )
            .catch(() =>
              Swal({
                title: 'Error',
                text: `Couldn't kill port ${port}.`,
                type: 'error'
              })
            );
        }
      },
      addProjectToGroup: project => {
        self.addingProjectToGroup = project;
      },
      bulkImport: flow(function*() {
        const folderName = yield ipcc.callMain('open-dialog');
      }),
      closeFile: () => {
        self.openedFile = null;
      },
      setOpenedFile: filePath => {
        const content = fs.readFileSync(filePath, 'utf8');
        self.openedFile = {
          content
        };
      },
      pickGroupForProject: group => {
        self.addingProjectToGroup.group = group.id;
        self.addingProjectToGroup = null;
      },
      addNewProject: project => {
        if (!self.groups.find(g => g.id === 'other')) {
          self.groups.push({ id: 'other', name: 'Others', projects: [] });
        }

        if (!project.group) {
          let othersGroup = self.groups.find(g => g.id === 'other');
          project.setGroup(othersGroup);
        }

        self.projects.push(project);
      },
      openFolder: flow(function*(groupId) {
        const folderName = yield ipcc.callMain('open-dialog');
        const splitted = folderName.split('/');
        const group = groupId && typeof groupId !== 'object' && self.groups.find(g => g.id === groupId);

        let createdProject = Project.create({
          name: splitted[splitted.length - 1],
          path: folderName,
          ...(group ? { group } : {})
        });

        self.addNewProject(createdProject);
      }),
      createGroup: flow(function*() {
        const { value: name } = yield prompt('Group title');
        if (name) {
          self.groups.push(
            Group.create({
              name
            })
          );
        }
      }),
      removeProject: flow(function*(projectId) {
        const confirmed = yield confirmDelete(
          'Are you sure?',
          `This will only remove the project from the dashboard, it won't delete any files on disk.`
        );
        if (confirmed) {
          self.projects = self.projects.filter(p => p.id !== projectId);
        }
      }),
      renameProject: flow(function*(projectId, projectName) {
        const project = self.projects.find(({ id }) => id === projectId);
        if (project === undefined) return;
        const { value: name } = yield prompt('Rename project', undefined, {
          inputValue: projectName
        });
        if (name) {
          project.setName(name);
        }
      }),
      renameGroup: flow(function*(groupName, groupId) {
        const { value: name } = yield prompt('Rename group', undefined, {
          inputValue: groupName
        });
        if (name) {
          const group = self.groups.find(g => g.id === groupId);
          group.setName(name);
        }
      }),
      deleteGroup: flow(function*(groupId) {
        const confirmed = yield confirmDelete(
          'Are you sure?',
          `This will also remove all the projects in the group. It won't delete anything on disk!`
        );
        if (confirmed) {
          self.projects = self.projects.filter(p => {
            if (groupId === 'other') {
              return p.group !== null && p.group.id !== 'other';
            }
            return p.group.id !== groupId;
          });
          self.groups = self.groups.filter(g => g.id !== groupId);
        }
      }),
      createProject: flow(function* createProject({ path, name, cli, cliName = cli, argz }) {
        const commandExists = yield ipcc.callMain('command-exists', cli);

        if (!commandExists) {
          self.home.clearActiveGenerator();

          const { value } = yield Swal({
            title: `The ${cli} CLI is not installed on your machine. Do you want to install it?`,
            type: 'warning',
            showCancelButton: true
          });

          if (value === true) {
            const newProcess = Process.create();
            self.processes.add(newProcess);
            newProcess.attach(`npm`, ['install', cliName, '-g']);
          }

          return false;
        }

        if (!fs.existsSync(path)) {
          fs.mkdirSync(path);
        }

        const newProcess = Process.create();

        const newProject = Project.create({
          name,
          path: `${path}${path[path.length - 1] === '/' ? '' : '/'}${name}`,
          ready: false
        });

        self.addNewProject(newProject);
        self.processes.add(newProcess);

        const resultCode = yield newProcess.attach(cli, argz, path);

        if (resultCode === 0) {
          newProject.setReady(true);
        } else {
          self.projects = self.projects.filter(p => p.path !== newProject.path);
        }
      }),
      setActiveGenerator: generator => {
        self.generateDialogOpen.setFalse();
        self.activeGenerator = generator;
      },
      clearActiveGenerator: () => {
        self.activeGenerator = null;
      },
      runCliGenerator: formValues => {
        const store = getRoot(self);
        const command = self.activeGenerator.getForProcess(formValues);
        store.createProject(command);
        self.clearActiveGenerator();
      }
    };
  })
  .views(self => ({
    get collapsed() {
      return !!self.addingProjectToGroup;
    },
    get hasProjects() {
      return self.groupsWithProjects && self.groupsWithProjects.length > 0;
    },
    get allProjects() {
      const projectsFromGroups = self.groups.reduce((accum, group) => {
        accum = [...accum, ...group.projects];
        return accum;
      }, []);
      return [...projectsFromGroups, ...self.projects];
    },
    get currentProject() {
      if (self.router.page === 'project') {
        return self.projects.find(project => project.id === self.router.params.id);
      }
    },
    get canMoveProject() {
      return self.groups.length > 1;
    },
    get groupsWithProjects() {
      const grouped = groupBy(self.projects, p => (p.group ? p.group.id : 'other'));
      return compact(
        [...self.groups].map(group => {
          if (!group) {
            return null;
          }
          return {
            ...group,
            projects: grouped[group.id] || []
          };
        })
      );
    }
  }));
